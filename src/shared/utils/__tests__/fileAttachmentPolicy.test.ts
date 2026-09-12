import {
  FileAttachmentError,
  type FileAttachmentTarget,
  type FileAttachmentFact as ManagedFileFact,
} from '@/shared/contracts/fileAttachment';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import {
  fileAttachmentMode,
  validateFileAttachments,
  IMAGE_CONTEXT_TOKEN_RESERVE,
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_COUNT,
  MAX_IMAGE_ATTACHMENT_TOTAL_BYTES,
  MIN_TEXT_CONTEXT_TOKEN_RESERVE,
} from '../fileAttachmentPolicy';

const MODEL: FileAttachmentTarget = {
  purpose: 'chat',
  acceptsImages: true,
  maxInputTokens: 120_000,
};

describe('image attachment limits', () => {
  test('classifies RTF as a document before generic text while leaving CSV as text', () => {
    expect(fileAttachmentMode({ mediaType: 'text/rtf', name: 'document.rtf' })).toBe('document');
    expect(fileAttachmentMode({ mediaType: 'text/csv', name: 'data.csv' })).toBe('text');
  });
  test('accepts values exactly on every byte and count boundary', () => {
    const files = Array.from({ length: MAX_IMAGE_ATTACHMENT_COUNT }, (_, index) =>
      imageFact(index, Math.floor(MAX_IMAGE_ATTACHMENT_TOTAL_BYTES / MAX_IMAGE_ATTACHMENT_COUNT)),
    );

    expect(findImageAttachmentLimit(files, MODEL)).toBeNull();
    expect(findImageAttachmentLimit([imageFact(0, MAX_IMAGE_ATTACHMENT_BYTES)], MODEL)).toBeNull();
    expect(
      findImageAttachmentLimit(
        [
          imageFact(0, MAX_IMAGE_ATTACHMENT_TOTAL_BYTES / 2),
          imageFact(1, MAX_IMAGE_ATTACHMENT_TOTAL_BYTES / 2),
        ],
        MODEL,
      ),
    ).toBeNull();
    expect(
      findImageAttachmentLimit([imageFact(0, 1)], {
        ...MODEL,
        maxInputTokens: MIN_TEXT_CONTEXT_TOKEN_RESERVE + IMAGE_CONTEXT_TOKEN_RESERVE,
      }),
    ).toBeNull();
  });

  test('classifies count, single-file, total-byte, and context overages', () => {
    expect(
      findImageAttachmentLimit(
        Array.from({ length: MAX_IMAGE_ATTACHMENT_COUNT + 1 }, (_, index) => imageFact(index, 1)),
        MODEL,
      ),
    ).toBe('count');
    expect(findImageAttachmentLimit([imageFact(0, MAX_IMAGE_ATTACHMENT_BYTES + 1)], MODEL)).toBe(
      'file-bytes',
    );
    expect(
      findImageAttachmentLimit(
        [
          imageFact(0, 7 * 1024 * 1024),
          imageFact(1, 7 * 1024 * 1024),
          imageFact(2, 7 * 1024 * 1024),
        ],
        MODEL,
      ),
    ).toBe('total-bytes');
    expect(
      findImageAttachmentLimit([imageFact(0, 1)], {
        ...MODEL,
        maxInputTokens: MIN_TEXT_CONTEXT_TOKEN_RESERVE + IMAGE_CONTEXT_TOKEN_RESERVE - 1,
      }),
    ).toBe('context');
  });
});

function imageFact(index: number, size: number): ManagedFileFact {
  return {
    fileEntryId: FileEntryIdSchema.parse(
      `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
    ),
    mediaType: 'image/png',
    name: `image-${index}.png`,
    size,
  };
}

function findImageAttachmentLimit(files: readonly ManagedFileFact[], target: FileAttachmentTarget) {
  try {
    validateFileAttachments(files, target);
    return null;
  } catch (error) {
    if (error instanceof FileAttachmentError) return error.issue.code;
    throw error;
  }
}
