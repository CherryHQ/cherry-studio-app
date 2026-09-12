import {
  FileAttachmentError,
  type FileAttachmentFact,
  type FileAttachmentTarget,
} from '@/shared/contracts/fileAttachment';

import { documentFileTypeFromMediaType } from './documentFileTypes';
import { AI_IMAGE_INPUT_MAX_COUNT, isAiSupportedImageMediaType } from './imageFileTypes';
import { isSupportedTextAttachment } from './textFileTypes';

export const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_CHARACTERS = 200_000;
export const MAX_TEXT_ATTACHMENT_TOTAL_CHARACTERS = 400_000;
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_ATTACHMENT_PAGES = 100;
export const MAX_IMAGE_ATTACHMENT_COUNT = AI_IMAGE_INPUT_MAX_COUNT;
export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;
export const IMAGE_CONTEXT_TOKEN_RESERVE = 4_096;
export const MIN_TEXT_CONTEXT_TOKEN_RESERVE = 1_024;

export function fileAttachmentMode(file: Pick<FileAttachmentFact, 'mediaType' | 'name'>) {
  if (isAiSupportedImageMediaType(file.mediaType)) return 'image';
  if (documentFileTypeFromMediaType(file.mediaType)) return 'document';
  if (isSupportedTextAttachment(file)) return 'text';
  return undefined;
}

/** Metadata admission only. Content reads happen after the whole request passes. */
export function validateFileAttachments(
  files: readonly FileAttachmentFact[],
  target: FileAttachmentTarget,
): void {
  const images: FileAttachmentFact[] = [];
  for (const file of files) {
    const mode = fileAttachmentMode(file);
    const issue = { fileEntryId: file.fileEntryId, name: file.name };
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new FileAttachmentError({ ...issue, code: 'unavailable' });
    }
    if (!mode || (target.purpose === 'painting' && mode !== 'image')) {
      throw new FileAttachmentError({ ...issue, code: 'unsupported-type' });
    }
    if (mode === 'image') {
      if (!target.acceptsImages) {
        throw new FileAttachmentError({ ...issue, code: 'model-unsupported' });
      }
      images.push(file);
    }
    const limit =
      mode === 'image'
        ? MAX_IMAGE_ATTACHMENT_BYTES
        : mode === 'document'
          ? MAX_DOCUMENT_ATTACHMENT_BYTES
          : MAX_TEXT_ATTACHMENT_BYTES;
    if (file.size > limit) throw new FileAttachmentError({ ...issue, code: 'file-bytes', limit });
  }
  const maxImages = Math.min(
    MAX_IMAGE_ATTACHMENT_COUNT,
    target.maxImages ?? MAX_IMAGE_ATTACHMENT_COUNT,
  );
  if (images.length > maxImages) throw new FileAttachmentError({ code: 'count', limit: maxImages });
  if (images.reduce((total, image) => total + image.size, 0) > MAX_IMAGE_ATTACHMENT_TOTAL_BYTES) {
    throw new FileAttachmentError({ code: 'total-bytes', limit: MAX_IMAGE_ATTACHMENT_TOTAL_BYTES });
  }
  if (
    images.length > 0 &&
    target.maxInputTokens !== undefined &&
    MIN_TEXT_CONTEXT_TOKEN_RESERVE + images.length * IMAGE_CONTEXT_TOKEN_RESERVE >
      target.maxInputTokens
  ) {
    throw new FileAttachmentError({ code: 'context', limit: target.maxInputTokens });
  }
}
