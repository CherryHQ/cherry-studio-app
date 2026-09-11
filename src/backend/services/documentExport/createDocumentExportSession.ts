import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  DocumentExportError,
  type DocumentExportArtifact,
  type DocumentExportInput,
  type DocumentExportProgress,
  type DocumentExportSession,
  type DocumentExportTarget,
  type ExportFile,
} from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';
import { readableFilename } from '@/shared/data/types/file';

import { normalizeDocument } from './normalizeDocument';
import { renderMarkdown } from './renderMarkdown';
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
  let saved: { artifactId: string; file: ResolvedFile } | undefined;
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
    if (
      target.format === 'markdown' &&
      current?.format === 'markdown' &&
      new File(current.file.uri).exists
    )
      return current;
    const progress = (stage: DocumentExportProgress) => {
      signal.throwIfAborted();
      assertActive();
      onProgress?.(stage);
    };
    const id = randomUUID();
    const outputDirectory = new Directory(directory, id);
    let didPublish = false;
    try {
      progress('rendering');
      let content: Omit<DocumentExportArtifact, 'id' | 'file'>;
      let text: string | undefined;
      let capture:
        | Awaited<ReturnType<Extract<DocumentExportTarget, { format: 'image' }>['capture']>>
        | undefined;
      const extension =
        target.format === 'markdown' ? 'md' : target.format === 'html' ? 'html' : 'webp';
      const mediaType =
        target.format === 'markdown'
          ? 'text/markdown'
          : target.format === 'html'
            ? 'text/html'
            : 'image/webp';
      const filename = readableFilename(document.title ?? '', { extension, fallback: 'document' });
      if (target.format === 'markdown') {
        text = markdown;
        content = { format: 'markdown', issues: [] };
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
        text = result.html;
        content = { format: target.format, issues: result.issues };
        if (target.format === 'image') {
          progress('capturing');
          capture = await target.capture({
            html: result.html,
            width: target.presentation.width,
            maxHeight: 8192,
            maxPixels: 12_000_000,
            signal,
          });
        }
      }
      // Always release a successful capture, even when a late cancellation wins.
      try {
        progress('writing');
        outputDirectory.create({ intermediates: true });
        const file = new File(outputDirectory, filename);
        let artifact: DocumentExportArtifact;
        if (capture) {
          if (
            !Number.isInteger(capture.width) ||
            !Number.isInteger(capture.height) ||
            capture.width < 1 ||
            capture.height < 1 ||
            capture.width * capture.height > 12_000_000 ||
            capture.width > 16383 ||
            capture.height > 16383
          )
            throw new DocumentExportError('size-limit');
          await new File(capture.uri).copy(file);
          artifact = {
            id,
            file: { filename, mediaType, uri: file.uri },
            format: 'image',
            width: capture.width,
            height: capture.height,
            issues: content.issues,
          };
        } else {
          file.write(text!);
          const common = {
            id,
            file: { filename, mediaType, uri: file.uri },
            issues: content.issues,
          };
          artifact =
            target.format === 'markdown'
              ? { ...common, format: 'markdown', text: text! }
              : { ...common, format: 'html', html: text! };
        }
        signal.throwIfAborted();
        assertActive();
        if (current) removeDirectory(new File(current.file.uri).parentDirectory);
        artifact = Object.freeze({
          ...artifact,
          file: Object.freeze(artifact.file),
          issues: Object.freeze(artifact.issues.map((issue) => Object.freeze(issue))),
        });
        current = artifact;
        saved = undefined;
        didPublish = true;
        return artifact;
      } finally {
        try {
          capture?.release();
        } catch {
          /* A retained artifact remains usable if native cleanup fails. */
        }
      }
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
    render: (target, context) =>
      run(context?.signal, (signal) => render(target, signal, context?.onProgress)),
    save: (artifact, signal) =>
      run(signal, async (operationSignal) => {
        operationSignal.throwIfAborted();
        if (current !== artifact) throw new DocumentExportError('invalid-input');
        if (saved?.artifactId === artifact.id && new File(saved.file.uri).exists) return saved.file;
        const file = await dependencies.saveFile(artifact.file, operationSignal);
        // A committed save outlives this session, including a concurrent page close.
        saved = { artifactId: artifact.id, file };
        return file;
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
          saved = undefined;
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
