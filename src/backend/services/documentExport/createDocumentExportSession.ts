import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  DOCUMENT_EXPORT_IMAGE_MAX_HEIGHT,
  DOCUMENT_EXPORT_IMAGE_MAX_PIXELS,
  DOCUMENT_EXPORT_MAX_IMAGES,
  DOCUMENT_EXPORT_WEBP_MAX_DIMENSION,
  DocumentExportError,
  type DocumentExportArtifact,
  type DocumentExportInput,
  type DocumentExportIssue,
  type DocumentExportProgress,
  type DocumentExportSession,
  type DocumentExportTarget,
  type ExportFile,
  type ExportImage,
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
  let currentDirectory: Directory | undefined;
  let saved: { artifactId: string; files: ResolvedFile[] } | undefined;
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
      let issues: readonly DocumentExportIssue[] = [];
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
        issues = result.issues;
        if (target.format === 'image') {
          progress('capturing');
          capture = await target.capture({
            html: result.html,
            width: target.presentation.width,
            maxHeight: DOCUMENT_EXPORT_IMAGE_MAX_HEIGHT,
            maxPixels: DOCUMENT_EXPORT_IMAGE_MAX_PIXELS,
            signal,
            onProgress: (current, total) => progress({ stage: 'capturing', current, total }),
          });
        }
      }
      // Always release a successful capture, even when a late cancellation wins.
      try {
        progress('writing');
        outputDirectory.create({ intermediates: true });
        let artifact: DocumentExportArtifact;
        if (capture) {
          if (!capture.images.length) throw new DocumentExportError('capture-failed');
          if (capture.images.length > DOCUMENT_EXPORT_MAX_IMAGES)
            throw new DocumentExportError('image-size-limit');
          const images: ExportImage[] = [];
          for (const [index, image] of capture.images.entries()) {
            progress('writing');
            if (
              !Number.isInteger(image.width) ||
              !Number.isInteger(image.height) ||
              image.width < 1 ||
              image.height < 1 ||
              image.width * image.height > DOCUMENT_EXPORT_IMAGE_MAX_PIXELS ||
              image.width > DOCUMENT_EXPORT_WEBP_MAX_DIMENSION ||
              image.height > DOCUMENT_EXPORT_WEBP_MAX_DIMENSION
            )
              throw new DocumentExportError('image-size-limit');
            const imageFilename =
              capture.images.length === 1
                ? filename
                : filename.replace(/\.webp$/, `-${String(index + 1).padStart(3, '0')}.webp`);
            const file = new File(outputDirectory, imageFilename);
            await new File(image.uri).copy(file);
            images.push(
              Object.freeze({
                file: Object.freeze({ filename: imageFilename, mediaType, uri: file.uri }),
                width: image.width,
                height: image.height,
              }),
            );
          }
          artifact = {
            id,
            format: 'image',
            images: Object.freeze(images),
            issues,
          };
        } else {
          const file = new File(outputDirectory, filename);
          file.write(text!);
          const common = {
            id,
            file: Object.freeze({ filename, mediaType, uri: file.uri }),
            issues,
          };
          artifact =
            target.format === 'markdown'
              ? { ...common, format: 'markdown', text: text! }
              : { ...common, format: 'html', html: text! };
        }
        signal.throwIfAborted();
        assertActive();
        if (currentDirectory) removeDirectory(currentDirectory);
        artifact = Object.freeze({
          ...artifact,
          issues: Object.freeze(artifact.issues.map((issue) => Object.freeze(issue))),
        });
        current = artifact;
        currentDirectory = outputDirectory;
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
        if (saved?.artifactId !== artifact.id) saved = { artifactId: artifact.id, files: [] };
        const files =
          artifact.format === 'image'
            ? artifact.images.map((image) => image.file)
            : [artifact.file];
        for (const [index, file] of files.entries()) {
          operationSignal.throwIfAborted();
          if (!saved.files[index] || !new File(saved.files[index].uri).exists) {
            // Keep successful saves even if a later page fails or the page closes.
            saved.files[index] = await dependencies.saveFile(file, operationSignal);
          }
        }
        return Object.freeze([...saved.files]);
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
          currentDirectory = undefined;
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
