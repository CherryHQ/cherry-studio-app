import {
  FileAttachmentError,
  type DocumentParserMode,
  type FileAttachmentContent,
  type FileAttachmentFact,
  type FileAttachmentReport,
  type FileAttachmentTarget,
} from '@/shared/contracts/fileAttachment';
import {
  fileAttachmentMode,
  IMAGE_CONTEXT_TOKEN_RESERVE,
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_COUNT,
  MAX_IMAGE_ATTACHMENT_TOTAL_BYTES,
  MIN_TEXT_CONTEXT_TOKEN_RESERVE,
  MAX_TEXT_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_CHARACTERS,
  MAX_TEXT_ATTACHMENT_TOTAL_CHARACTERS,
  validateFileAttachments,
} from '@/shared/utils/fileAttachmentPolicy';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

import { type AttachmentContentReader, readAttachmentContent } from './readAttachmentContent';
import { takeCodePoints } from './utf8Text';

export type TextAttachmentLimits = {
  maxBytesPerFile: number;
  maxCharactersPerFile: number;
  maxTotalCharacters: number;
};

export type PreparedFileAttachment = {
  file: FileAttachmentFact;
  report: FileAttachmentReport;
  /** Untrusted user content; the caller owns the runtime envelope. Direct images have no body. */
  content?: FileAttachmentContent;
};

export type PrepareFileAttachmentsInput = AttachmentContentReader & {
  availableFiles: ReadonlyMap<string, FileAttachmentFact>;
  currentFileEntryIds: readonly string[];
  historicalFileEntryIds?: readonly string[];
  limits?: TextAttachmentLimits;
  signal: AbortSignal;
  target: FileAttachmentTarget;
  documentParserMode?: DocumentParserMode;
};

/**
 * One send-time workflow for chat and painting: canonical facts, request admission,
 * bounded content reads, then reports. Current files take priority; a historical file
 * may be omitted when unavailable. Repeated references consume budget per occurrence.
 */
export async function prepareFileAttachments(
  input: PrepareFileAttachmentsInput,
): Promise<ReadonlyMap<string, PreparedFileAttachment>> {
  input.signal.throwIfAborted();
  const currentFiles = input.currentFileEntryIds.map((id) => {
    const file = input.availableFiles.get(id);
    if (!file) throw new FileAttachmentError({ code: 'unavailable' });
    return file;
  });
  const historicalIds = (input.historicalFileEntryIds ?? []).filter((id) => {
    const file = input.availableFiles.get(id);
    const mode = file && fileAttachmentMode(file);
    return mode && (mode !== 'image' || input.target.acceptsImages);
  });
  // Historical image occurrences share the request ceiling. Text files have their own budget below.
  const historicalImages = historicalIds.flatMap((id) => {
    const file = input.availableFiles.get(id)!;
    return fileAttachmentMode(file) === 'image' ? [file] : [];
  });
  validateFileAttachments([...currentFiles, ...historicalImages], input.target);
  const directImages = [...currentFiles, ...historicalImages].filter(
    (file) => fileAttachmentMode(file) === 'image',
  );
  let imageCount = directImages.length;
  let imageBytes = directImages.reduce((total, file) => total + file.size, 0);
  const occurrences = [...input.currentFileEntryIds, ...historicalIds];
  const counts = new Map<string, number>();
  for (const id of occurrences) counts.set(id, (counts.get(id) ?? 0) + 1);
  const currentIds = new Set(input.currentFileEntryIds);
  const limits = input.limits ?? {
    maxBytesPerFile: MAX_TEXT_ATTACHMENT_BYTES,
    maxCharactersPerFile: MAX_TEXT_ATTACHMENT_CHARACTERS,
    maxTotalCharacters: MAX_TEXT_ATTACHMENT_TOTAL_CHARACTERS,
  };
  let remainingCharacters = limits.maxTotalCharacters;
  const result = new Map<string, PreparedFileAttachment>();
  for (const [id, count] of counts) {
    const file = input.availableFiles.get(id)!;
    const mode = fileAttachmentMode(file)!;
    if (mode === 'image') {
      result.set(id, { file, report: { mode, sourceTruncated: false, requestTruncated: false } });
      continue;
    }
    const budget = Math.max(
      0,
      Math.min(limits.maxCharactersPerFile, Math.floor(remainingCharacters / count)),
    );
    if (!currentIds.has(id) && budget === 0) continue;
    try {
      const content = await readAttachmentContent(
        file,
        input,
        input.signal,
        limits.maxBytesPerFile,
        input.documentParserMode,
      );
      if (content.kind === 'document') {
        const { parser, parserVersion, output } = content.parsed;
        const totalCharacters = takeCodePoints(JSON.stringify(output.ir), Infinity).characters;
        let nextImageCount = imageCount;
        let nextImageBytes = imageBytes;
        const assets: Extract<FileAttachmentContent, { kind: 'document' }>['assets'] = [];
        const assetDelivery = output.assets.map((asset) => {
          const size = asset.bytes.byteLength;
          let status: Extract<
            FileAttachmentContent,
            { kind: 'document' }
          >['assetDelivery'][number]['status'];
          if (!input.target.acceptsImages) status = 'model-unsupported';
          else if (!isAiSupportedImageMediaType(asset.contentType)) status = 'unsupported-type';
          else if (
            size > MAX_IMAGE_ATTACHMENT_BYTES ||
            nextImageCount + count >
              Math.min(
                MAX_IMAGE_ATTACHMENT_COUNT,
                input.target.maxImages ?? MAX_IMAGE_ATTACHMENT_COUNT,
              ) ||
            nextImageBytes + size * count > MAX_IMAGE_ATTACHMENT_TOTAL_BYTES ||
            (input.target.maxInputTokens !== undefined &&
              MIN_TEXT_CONTEXT_TOKEN_RESERVE +
                (nextImageCount + count) * IMAGE_CONTEXT_TOKEN_RESERVE >
                input.target.maxInputTokens)
          )
            status = 'budget';
          else {
            status = 'sent';
            assets.push(asset);
            nextImageCount += count;
            nextImageBytes += size * count;
          }
          return { assetRef: asset.assetRef, contentType: asset.contentType, size, status };
        });
        const documentContent: Extract<FileAttachmentContent, { kind: 'document' }> = {
          kind: 'document',
          parser,
          parserVersion,
          totalCharacters,
          assetDelivery,
          assets,
          document: {
            delivery: 'complete',
            result: { status: 'ok', ir: output.ir, warnings: output.warnings },
          },
        };
        // Count JSON transport, never ArrayBuffer bytes. A deferred document is not a JSON prefix.
        const characterCount = () =>
          takeCodePoints(JSON.stringify({ ...documentContent, assets: undefined }), Infinity)
            .characters;
        let includedCharacters = characterCount();
        if (includedCharacters > budget) {
          documentContent.document = { delivery: 'deferred' };
          includedCharacters = characterCount();
        }
        if (includedCharacters > budget)
          throw new FileAttachmentError({
            code: 'context',
            fileEntryId: file.fileEntryId,
            name: file.name,
            limit: budget,
          });
        result.set(id, {
          file,
          content: documentContent,
          report: {
            mode: 'document-ir',
            parser,
            parserVersion,
            delivery: documentContent.document.delivery,
            sourceTruncated: false,
            requestTruncated: false,
            includedCharacters,
            images: {
              sent: assets.length,
              omitted: output.assets.length - assets.length,
              omittedReasons: [
                ...new Set(
                  assetDelivery.flatMap((asset) => (asset.status === 'sent' ? [] : [asset.status])),
                ),
              ],
            },
          },
        });
        imageCount = nextImageCount;
        imageBytes = nextImageBytes;
        remainingCharacters -= includedCharacters * count;
        continue;
      }
      const projected = takeCodePoints(content.text, budget);
      result.set(id, {
        file,
        content: { kind: 'text', text: projected.value },
        report: {
          mode: mode === 'document' ? 'document-text' : 'text',
          ...(content.parser ? { parser: content.parser } : {}),
          sourceTruncated: content.sourceTruncated,
          requestTruncated: projected.didTruncate,
          includedCharacters: projected.characters,
        },
      });
      remainingCharacters -= projected.characters * count;
    } catch (error) {
      input.signal.throwIfAborted();
      if (currentIds.has(id)) throw error;
    }
  }
  return result;
}
