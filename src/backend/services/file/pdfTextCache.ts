import { Directory, File, Paths } from 'expo-file-system';
import * as z from 'zod';

import type { FileEntry } from '@/shared/data/types/file';
import { MAX_PDF_ATTACHMENT_PAGES } from '@/shared/utils/fileAttachmentPolicy';

import type { ExtractResult } from '../../../../modules/pdf-text-extractor';

// Increment when native extraction policy changes. Cached text is disposable, never canonical.
const CACHE_VERSION = 2;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 256;
const resultSchema = z.object({
  text: z.string().max(1_000_000),
  totalPages: z.number().int().nonnegative(),
  extractedPages: z.number().int().min(0).max(MAX_PDF_ATTACHMENT_PAGES),
  isTruncated: z.boolean(),
  extractionError: z.literal(false),
  ocrError: z.literal(false),
  unrecognizedPages: z
    .array(z.number().int().min(1).max(MAX_PDF_ATTACHMENT_PAGES))
    .max(MAX_PDF_ATTACHMENT_PAGES),
});

function directory(): Directory {
  return new Directory(Paths.cache, 'PdfText');
}

/** Managed filenames contain the immutable entry ID. Never persist a sandbox path. */
export function pdfTextCacheFile(source: File): File {
  return new File(
    directory(),
    `${source.name}.v${CACHE_VERSION}.${source.size}.${source.modificationTime ?? 0}.${MAX_PDF_ATTACHMENT_PAGES}.json`,
  );
}

export async function readPdfTextCache(file: File): Promise<ExtractResult | undefined> {
  try {
    if (!file.exists || file.size > MAX_ENTRY_BYTES) return undefined;
    return resultSchema.parse(JSON.parse(await file.text()));
  } catch {
    // An interrupted write or an OS-purged cache is a miss, not a document error.
    return undefined;
  }
}

export function writePdfTextCache(file: File, result: ExtractResult): void {
  if (result.extractionError || result.ocrError) return;
  try {
    const folder = directory();
    folder.create({ intermediates: true, idempotent: true });
    const data = JSON.stringify(resultSchema.parse(result));
    if (new TextEncoder().encode(data).byteLength > MAX_ENTRY_BYTES) return;
    file.write(data);
    // Bound disk retention. No OCR results or bitmaps accumulate in a JS memory cache.
    const entries = folder
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((entry) => ({ entry, size: entry.size, time: entry.modificationTime ?? 0 }))
      .sort((a, b) => b.time - a.time);
    let bytes = 0;
    for (const [index, { entry, size }] of entries.entries()) {
      bytes += size;
      if (bytes > MAX_CACHE_BYTES || index >= MAX_CACHE_ENTRIES) entry.delete();
    }
  } catch {
    // Cache storage failure must not discard successfully extracted document text.
  }
}

export function deletePdfTextCache(entry: Pick<FileEntry, 'id'>): void {
  const folder = directory();
  if (!folder.exists) return;
  for (const file of folder.list()) {
    if (file.name.startsWith(`${entry.id}.`)) file.delete();
  }
}

/** Called at the cold-start restore gate, before file readers exist. */
export function resetPdfTextCacheForRestore(): void {
  const folder = directory();
  if (folder.exists) folder.delete();
}
