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

describe('attachment source byte limits', () => {
  test.each([
    ['notes.txt', 'text/plain', 5 * 1024 * 1024],
    ['report.pdf', 'application/pdf', 50 * 1024 * 1024],
    [
      'report.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      20 * 1024 * 1024,
    ],
    ['photo.png', 'image/png', 10 * 1024 * 1024],
    ['meeting.m4a', 'audio/x-m4a', 25 * 1000 * 1000],
  ] as const)('admits %s at its ceiling and rejects one extra byte', (name, mediaType, limit) => {
    const file = { ...imageFact(0, limit), name, mediaType };
    expect(() => validateFileAttachments([file], MODEL)).not.toThrow();
    expect(() => validateFileAttachments([{ ...file, size: limit + 1 }], MODEL)).toThrow(
      new FileAttachmentError({
        code: 'file-bytes',
        fileEntryId: file.fileEntryId,
        name,
        limit,
      }),
    );
  });
});

test('audio is recognized by type or extension, after text and documents', () => {
  const mode = (name: string, mediaType: string) => fileAttachmentMode({ name, mediaType });
  expect(mode('voice.mp3', 'audio/mpeg')).toBe('audio');
  // Pickers label audio generically or as video.
  expect(mode('meeting.m4a', 'application/octet-stream')).toBe('audio');
  expect(mode('call.mp4', 'video/mp4')).toBe('audio');
  // Text that merely looks like an audio name stays text; unsupported audio is not admitted.
  expect(mode('notes.mp3', 'text/plain')).toBe('text');
  expect(mode('memo.amr', 'audio/amr')).toBeUndefined();
});

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
