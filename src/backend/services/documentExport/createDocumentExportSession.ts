import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  DocumentExportError,
  type DocumentExportArtifact,
  type DocumentExportInput,
  type DocumentExportProgress,
  type DocumentExportSession,
  type DocumentExportTarget,
  type ExportImagePage,
} from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { ExportFile } from '@/shared/contracts/fileExport';
import { readableFilename } from '@/shared/data/types/file';
import { renderMarkdownSignature } from '@/shared/utils/documentExportMarkdown';

import { normalizeDocument } from './normalizeDocument';
import { renderMarkdown, renderMarkdownWithImages } from './renderMarkdown';
import type { PreparedAsset, ReadManagedImage } from './resolveDocumentAssets';

export type DocumentExportDependencies = {
  readManagedImage: ReadManagedImage;
  saveFile(file: ExportFile, signal: AbortSignal): Promise<ResolvedFile>;
};

export function createDocumentExportSession(
  input: DocumentExportInput,
  dependencies: DocumentExportDependencies,
  assertActive: () => void,
  onDisposed: () => void,
): DocumentExportSession & { cancel(): void } {
  const document = normalizeDocument(input);
  const markdown = renderMarkdown(document);
  const directory = new Directory(Paths.cache, 'DocumentExport', randomUUID());
  const assets = new Map<string, PreparedAsset>();
  let operation: { controller: AbortController; promise: Promise<unknown> } | undefined;
  let current: DocumentExportArtifact | undefined;
  const saved = new Map<string, ResolvedFile>();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  function run<T>(
    signal: AbortSignal | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (disposed) return Promise.reject(new DocumentExportError('disposed'));
    if (operation) return Promise.reject(new DocumentExportError('busy'));
    try {
      assertActive();
      signal?.throwIfAborted();
    } catch (error) {
      return Promise.reject(error);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const promise = Promise.resolve()
      .then(() => work(controller.signal))
      .finally(() => {
        signal?.removeEventListener('abort', abort);
        operation = undefined;
      });
    operation = { controller, promise };
    return promise;
  }

  async function render(
    target: DocumentExportTarget,
    signal: AbortSignal,
    onProgress?: (progress: DocumentExportProgress) => void,
  ): Promise<DocumentExportArtifact> {
    signal.throwIfAborted();
    const progress = (stage: DocumentExportProgress) => {
      signal.throwIfAborted();
      assertActive();
      onProgress?.(stage);
    };
    let preparedMarkdown: Awaited<ReturnType<typeof renderMarkdownWithImages>> | undefined;
    if (target.format === 'markdown') {
      progress('resolving-assets');
      preparedMarkdown = await renderMarkdownWithImages(
        document,
        assets,
        dependencies.readManagedImage,
        signal,
      );
    }
    const markdownText =
      target.format === 'markdown'
        ? preparedMarkdown!.text + renderMarkdownSignature(target.watermark)
        : markdown;
    if (
      target.format === 'markdown' &&
      current?.format === 'markdown' &&
      current.text === markdownText &&
      new File(current.file.uri).exists
    )
      return current;
    const id = randomUUID();
    const outputDirectory = new Directory(directory, id);
    let didPublish = false;
    try {
      progress('rendering');
      outputDirectory.create({ intermediates: true });
      let artifact: DocumentExportArtifact;
      if (target.format === 'markdown') {
        const filename = readableFilename(document.title ?? '', {
          extension: 'md',
          fallback: 'document',
        });
        const file = new File(outputDirectory, filename);
        progress('writing');
        file.write(markdownText);
        artifact = {
          id,
          format: 'markdown',
          text: markdownText,
          issues: preparedMarkdown!.issues,
          file: { uri: file.uri, filename, mediaType: 'text/markdown' },
        };
      } else {
        progress('resolving-assets');
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy loading shared by Metro and CommonJS tests
        const { renderHtml } = require('./renderHtml') as typeof import('./renderHtml');
        signal.throwIfAborted();
        const result = await renderHtml(
          document,
          target.presentation,
          assets,
          dependencies.readManagedImage,
          signal,
        );
        if (target.format === 'html') {
          const filename = readableFilename(document.title ?? '', {
            extension: 'html',
            fallback: 'document',
          });
          const file = new File(outputDirectory, filename);
          progress('writing');
          file.write(result.html);
          artifact = {
            id,
            format: 'html',
            html: result.html,
            issues: result.issues,
            file: { uri: file.uri, filename, mediaType: 'text/html' },
          };
        } else {
          const pages: ExportImagePage[] = [];
          let total: number | undefined;
          const filename = readableFilename(document.title ?? '', {
            extension: 'png',
            fallback: 'document',
          });
          progress('capturing');
          await target.capture({
            html: result.html,
            width: target.presentation.width,
            layout: target.layout,
            signal,
            onPage: async (image) => {
              signal.throwIfAborted();
              if (
                ![image.width, image.height, image.total].every(
                  (value) => Number.isSafeInteger(value) && value > 0,
                ) ||
                image.index !== pages.length ||
                image.index >= image.total ||
                (total !== undefined && total !== image.total)
              )
                throw new DocumentExportError('capture-failed');
              total = image.total;
              progress({ stage: 'capturing', page: image.index + 1, total });
              const pageFilename =
                total === 1
                  ? filename
                  : `${filename.slice(0, -4)}-${String(image.index + 1).padStart(Math.max(3, String(total).length), '0')}.png`;
              const file = new File(outputDirectory, pageFilename);
              await new File(image.uri).copy(file);
              signal.throwIfAborted();
              pages.push(
                Object.freeze({
                  width: image.width,
                  height: image.height,
                  file: Object.freeze({
                    filename: pageFilename,
                    mediaType: 'image/png',
                    uri: file.uri,
                  }),
                }),
              );
            },
          });
          if (!pages.length || pages.length !== total)
            throw new DocumentExportError('capture-failed');
          artifact = {
            id,
            format: 'image',
            layout: target.layout,
            pages: Object.freeze(pages),
            issues: result.issues,
          };
        }
      }
      signal.throwIfAborted();
      assertActive();
      if (current) removeDirectory(new Directory(directory, current.id));
      if (artifact.format !== 'image') Object.freeze(artifact.file);
      artifact = Object.freeze({
        ...artifact,
        issues: Object.freeze(artifact.issues.map((issue) => Object.freeze(issue))),
      });
      current = artifact;
      saved.clear();
      didPublish = true;
      return artifact;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof DocumentExportError) throw error;
      throw new DocumentExportError('storage-failed');
    } finally {
      if (!didPublish) removeDirectory(outputDirectory);
    }
  }

  const session: DocumentExportSession & { cancel(): void } = {
    document,
    markdown,
    previewMarkdown: (text, presentation) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy loading shared by Metro and CommonJS tests
      const { renderMarkdownPreview } = require('./renderHtml') as typeof import('./renderHtml');
      return renderMarkdownPreview(text, presentation, document.labels);
    },
    render: (target, context) =>
      run(context?.signal, (signal) => render(target, signal, context?.onProgress)),
    save: (artifact, signal) =>
      run(signal, async (operationSignal) => {
        operationSignal.throwIfAborted();
        if (current !== artifact) throw new DocumentExportError('invalid-input');
        const files =
          artifact.format === 'image' ? artifact.pages.map((page) => page.file) : [artifact.file];
        const results: ResolvedFile[] = [];
        for (const file of files) {
          operationSignal.throwIfAborted();
          let resolved = saved.get(file.uri);
          if (!resolved || !new File(resolved.uri).exists) {
            resolved = await dependencies.saveFile(file, operationSignal);
            // A committed page survives cancellation; a retry must not duplicate it.
            saved.set(file.uri, resolved);
          }
          results.push(resolved);
        }
        return Object.freeze(results);
      }),
    cancel: () => operation?.controller.abort(),
    dispose: () => {
      disposed = true;
      session.cancel();
      disposal ??= (async () => {
        try {
          await operation?.promise.catch(() => {});
        } finally {
          removeDirectory(directory);
          assets.clear();
          current = undefined;
          saved.clear();
          onDisposed();
        }
      })();
      return disposal;
    },
  };
  return session;
}

function removeDirectory(directory: Directory) {
  // Cache eviction is best effort; it must not hide a completed save or cancellation.
  try {
    if (directory.exists) directory.delete();
  } catch {
    /* The OS may already have evicted it. */
  }
}
