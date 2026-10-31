import { Directory, File, Paths } from 'expo-file-system';

import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import {
  DocumentExtractionError,
  DOCUMENT_EXTRACTION_VERSION,
  type DocumentExtractionOptions,
  type DocumentExtractionResult,
} from '@/shared/contracts/documentExtraction';
import type { ResolvedFile } from '@/shared/contracts/file';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import {
  documentAttachmentByteLimit,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';
import { sha256Hex } from '@/shared/utils/sha256';

import { parseDocument } from './documentParser';
import { extractAnydocContent } from './extractAnydocContent';
import { hashLocalFile } from './fileHash';
import { readFileUriBytes } from './fileStorage';
import { readDocumentPages } from './fileTextExtraction';
import { LOCAL_OCR_MODEL_VERSION } from './localOcrModel';

/** This boundary accepts an already-resolved managed source, never a tool-supplied path or URL. */
export async function extractDocument(
  file: ResolvedFile,
  options: DocumentExtractionOptions,
  signal: AbortSignal,
): Promise<DocumentExtractionResult> {
  signal.throwIfAborted();
  const source = new File(file.uri);
  const isImage = isAiSupportedImageMediaType(file.entry.mediaType);
  const type = documentFileTypeFromMediaType(file.entry.mediaType);
  if (!source.exists) throw new DocumentExtractionError('unavailable');
  if (!isImage && !type) throw new DocumentExtractionError('unsupported');
  if (
    source.size >
    (isImage ? MAX_IMAGE_ATTACHMENT_BYTES : documentAttachmentByteLimit(file.entry.mediaType))
  )
    throw new DocumentExtractionError('size-limit');
  if (options.pages && type !== 'pdf') throw new DocumentExtractionError('invalid-input');
  if (options.assetRef && (isImage || type === 'pdf'))
    throw new DocumentExtractionError('invalid-input');
  const result: DocumentExtractionResult = {
    source: {
      fileEntryId: file.entry.id,
      revision: file.entry.updatedAt,
      filename: file.entry.filename,
      sha256: await hashLocalFile(file.uri, signal),
    },
    task: options.task,
    version: DOCUMENT_EXTRACTION_VERSION,
    status: 'complete',
    units: [],
    warnings: [],
  };
  let temporary: File | undefined;
  let handedOff = false;
  let assetVersion = '';
  try {
    let imageSource = source;
    if (!isImage && type !== 'pdf') {
      const document = await parseDocument(
        {
          fileEntryId: file.entry.id,
          name: file.entry.filename,
          mediaType: file.entry.mediaType,
          size: source.size,
        },
        { readBytes: () => readFileUriBytes(file.uri, signal) },
        'anydoc',
        signal,
      );
      if (document.parser !== 'anydoc') throw new DocumentExtractionError('unsupported');
      result.parserVersion = document.parserVersion;
      result.warnings = [...document.output.warnings];
      result.assets = document.output.assets.map((asset) => ({
        assetRef: asset.assetRef,
        mediaType: asset.contentType,
        size: asset.bytes.byteLength,
      }));
      if (!options.assetRef) {
        if (options.task === 'fields' || options.task === 'question')
          throw new DocumentExtractionError('unsupported');
        const view = extractAnydocContent(document.output.ir, options.task);
        result.units = view.units;
        if (options.task === 'document') result.ir = document.output.ir;
        if (view.truncated) {
          result.status = 'partial';
          result.warnings.push(
            'The structured view is incomplete or reached its limit; use read_file for the original IR.',
          );
        }
        if (view.units.some((unit) => unit.status !== 'complete')) result.status = 'partial';
        return result;
      }
      const asset = document.output.assets.find((asset) => asset.assetRef === options.assetRef);
      if (!asset || !asset.contentType || !isAiSupportedImageMediaType(asset.contentType))
        throw new DocumentExtractionError('unsupported');
      if (asset.bytes.byteLength > MAX_IMAGE_ATTACHMENT_BYTES)
        throw new DocumentExtractionError('size-limit');
      // The digest identifies the asset without using its untrusted name as a filesystem path.
      const bytes = new Uint8Array(asset.bytes);
      const digest = sha256Hex(bytes);
      assetVersion = `${document.parserVersion}:${digest}`;
      const folder = new Directory(Paths.cache, 'DocumentAssets');
      folder.create({ intermediates: true, idempotent: true });
      temporary = new File(folder, `${file.entry.id}.${digest}.${createOrderedUuid()}.image`);
      temporary.writeSync(bytes);
      imageSource = temporary;
    }
    const assetFile = temporary;
    handedOff = true;
    const extracted = await readDocumentPages(
      imageSource,
      type === 'pdf' ? 'pdf' : 'image',
      options,
      signal,
      assetFile
        ? {
            cacheSource: source,
            cacheKey: assetVersion,
            dispose: () => {
              if (assetFile.exists) assetFile.delete();
            },
          }
        : undefined,
    );
    signal.throwIfAborted();
    if (extracted.extractionError || extracted.ocrError || !extracted.pages)
      throw new DocumentExtractionError('failed');
    result.units = extracted.pages.map((unit) =>
      options.assetRef ? { ...unit, location: { assetRef: options.assetRef } } : unit,
    );
    result.modelVersion = result.units.some((unit) => unit.engine === 'xiaomi')
      ? LOCAL_OCR_MODEL_VERSION
      : undefined;
    if (type === 'pdf') {
      result.totalPages = extracted.totalPages;
      const last = Math.max(0, ...result.units.map((unit) => unit.location.page ?? 0));
      if (!options.pages && last < extracted.totalPages) result.nextPage = last + 1;
    }
    if (
      result.nextPage ||
      extracted.isTruncated ||
      result.units.some((unit) => unit.status !== 'complete')
    )
      result.status = 'partial';
    return result;
  } finally {
    if (!handedOff && temporary?.exists) temporary.delete();
  }
}
