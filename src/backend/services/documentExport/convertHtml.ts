import { randomUUID } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import {
  DocumentExportError,
  HTML_CONVERSION_MAX_EDGE,
  HTML_CONVERSION_MAX_PAGES,
  HTML_CONVERSION_MAX_PIXELS,
  type HtmlConversionContext,
  type HtmlConversionInput,
} from '@/shared/contracts/documentExport';
import { readableFilename } from '@/shared/data/types/file';

import type { DocumentExportDependencies } from './createDocumentExportSession';
import { createImagePresentation } from './imagePresentation';

const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;

export async function convertHtml(
  input: HtmlConversionInput,
  dependencies: DocumentExportDependencies,
  signal: AbortSignal,
  onProgress: HtmlConversionContext['onProgress'],
) {
  signal.throwIfAborted();
  const directory = new Directory(Paths.cache, 'HtmlConversion', randomUUID());
  const filename = readableFilename(input.title.replace(/\.html?$/i, ''), {
    extension: input.format === 'image' ? 'png' : 'pptx',
    fallback: 'document',
  });
  const file = new File(directory, filename);
  let pages = 0;
  let expectedTotal: number | undefined;
  let outputBytes = 0;
  let output: ReturnType<File['open']> | undefined;
  let presentation: ReturnType<typeof createImagePresentation> | undefined;
  try {
    directory.create({ intermediates: true });
    if (input.format === 'pptx') {
      file.create();
      output = file.open(FileMode.WriteOnly);
      presentation = createImagePresentation((chunk) => {
        signal.throwIfAborted();
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) throw new DocumentExportError('size-limit');
        output!.writeBytes(chunk);
      });
    }
    await input.capture({
      format: input.format,
      signal,
      onPage: async (page, index, total) => {
        signal.throwIfAborted();
        if (
          !Number.isSafeInteger(total) ||
          total < 1 ||
          total > HTML_CONVERSION_MAX_PAGES ||
          index !== pages ||
          index >= total ||
          (expectedTotal !== undefined && total !== expectedTotal) ||
          (input.format === 'image' && total !== 1) ||
          ![page.width, page.height].every(
            (value) =>
              Number.isSafeInteger(value) && value > 0 && value <= HTML_CONVERSION_MAX_EDGE,
          ) ||
          page.width * page.height > HTML_CONVERSION_MAX_PIXELS
        )
          throw new DocumentExportError('image-size-limit');
        expectedTotal = total;
        const image = new File(page.uri);
        if (image.size < 24 || image.size > MAX_OUTPUT_BYTES)
          throw new DocumentExportError('size-limit');
        onProgress?.({ stage: 'capturing', current: index + 1, total });
        if (presentation) {
          const entry = presentation.addSlide(page.width, page.height);
          const reader = image.open(FileMode.ReadOnly);
          try {
            let remaining = image.size;
            while (remaining > 0) {
              signal.throwIfAborted();
              const bytes = reader.readBytes(Math.min(CHUNK_BYTES, remaining));
              if (!bytes.length) throw new DocumentExportError('storage-failed');
              remaining -= bytes.length;
              entry.push(bytes, remaining === 0);
              // Yield during large PNGs so cancellation and native UI stay responsive.
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
          } finally {
            reader.close();
          }
        } else {
          await image.copy(file);
        }
        pages++;
      },
    });
    signal.throwIfAborted();
    if (!pages || pages !== expectedTotal) throw new DocumentExportError('capture-failed');
    onProgress?.({ stage: 'writing', current: pages, total: pages });
    presentation?.finish();
    output?.close();
    output = undefined;
    signal.throwIfAborted();
    return await dependencies.saveFile(
      {
        filename,
        uri: file.uri,
        mediaType:
          input.format === 'image'
            ? 'image/png'
            : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      signal,
    );
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DocumentExportError) throw error;
    throw new DocumentExportError('storage-failed');
  } finally {
    presentation?.cancel();
    output?.close();
    try {
      if (directory.exists) directory.delete();
    } catch {
      /* OS-owned temporary cache cleanup is best effort. */
    }
  }
}
