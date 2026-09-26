import {
  FileAttachmentError,
  type FileAttachmentTarget,
  type FileAttachmentFact as ManagedFileFact,
} from '@/shared/contracts/fileAttachment';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import {
  documentImageCountLimit,
  fileAttachmentMode,
  validateFileAttachments,
  IMAGE_CONTEXT_TOKEN_RESERVE,
  MAX_IMAGE_ATTACHMENT_BYTES,
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

  test('bounds chat images only per file: the Runtime prices the rest into the context', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      imageFact(index, MAX_IMAGE_ATTACHMENT_BYTES),
    );

    expect(findImageAttachmentLimit(many, MODEL)).toBeNull();
    expect(findImageAttachmentLimit(many, { ...MODEL, maxInputTokens: 2_000 })).toBeNull();
    expect(findImageAttachmentLimit([imageFact(0, MAX_IMAGE_ATTACHMENT_BYTES + 1)], MODEL)).toBe(
      'file-bytes',
    );
  });

  test('applies a declared reference limit, as painting models set one', () => {
    const painting: FileAttachmentTarget = {
      purpose: 'painting',
      acceptsImages: true,
      maxImages: 2,
    };

    expect(findImageAttachmentLimit([imageFact(0, 1), imageFact(1, 1)], painting)).toBeNull();
    expect(
      findImageAttachmentLimit([imageFact(0, 1), imageFact(1, 1), imageFact(2, 1)], painting),
    ).toBe('count');
  });

  test('sizes the document-image budget by the context reserve', () => {
    expect(
      documentImageCountLimit({
        maxInputTokens: MIN_TEXT_CONTEXT_TOKEN_RESERVE + 3 * IMAGE_CONTEXT_TOKEN_RESERVE,
      }),
    ).toBe(3);
    expect(documentImageCountLimit({ maxInputTokens: 500 })).toBe(0);
    expect(documentImageCountLimit({ maxImages: 2, maxInputTokens: 120_000 })).toBe(2);
    expect(documentImageCountLimit({})).toBe(Infinity);
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
