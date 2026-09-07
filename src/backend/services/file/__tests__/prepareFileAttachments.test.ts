import { FileAttachmentError, type FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import { MAX_IMAGE_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { prepareFileAttachments } from '../prepareFileAttachments';

const FILE_ID = '00000000-0000-7000-8000-000000000001';
const SECOND_ID = '00000000-0000-7000-8000-000000000002';
const text: FileAttachmentFact = {
  fileEntryId: FILE_ID,
  mediaType: 'text/plain',
  name: 'notes.txt',
  size: 5,
};
const image: FileAttachmentFact = { ...text, mediaType: 'image/png', name: 'image.png' };
const signal = () => new AbortController().signal;

function input(files: FileAttachmentFact[]) {
  return {
    availableFiles: new Map(files.map((file) => [file.fileEntryId, file])),
    currentFileEntryIds: files.map((file) => file.fileEntryId),
    readBytes: jest.fn(async () => new TextEncoder().encode('hello')),
    signal: signal(),
    target: { purpose: 'chat' as const, acceptsImages: true },
  };
}

describe('prepareFileAttachments', () => {
  test('rejects the whole request before reading when a later attachment is unsupported', async () => {
    const request = input([
      text,
      { ...text, fileEntryId: SECOND_ID, mediaType: 'application/zip' },
    ]);
    await expect(prepareFileAttachments(request)).rejects.toMatchObject({
      issue: { code: 'unsupported-type', fileEntryId: SECOND_ID },
    });
    expect(request.readBytes).not.toHaveBeenCalled();
  });

  test('shares image format, size and model admission across chat and painting', async () => {
    for (const purpose of ['chat', 'painting'] as const) {
      for (const [file, acceptsImages, code] of [
        [{ ...image, mediaType: 'image/heic' }, true, 'unsupported-type'],
        [{ ...image, size: MAX_IMAGE_ATTACHMENT_BYTES + 1 }, true, 'file-bytes'],
        [image, false, 'model-unsupported'],
      ] as const) {
        await expect(
          prepareFileAttachments({ ...input([file]), target: { purpose, acceptsImages } }),
        ).rejects.toMatchObject({ issue: { code } });
      }
    }
    await expect(
      prepareFileAttachments({
        ...input([text]),
        target: { purpose: 'painting', acceptsImages: true },
      }),
    ).rejects.toMatchObject({ issue: { code: 'unsupported-type' } });
  });

  test('uses the painting model count limit for the entire selection', async () => {
    await expect(
      prepareFileAttachments({
        ...input([image, { ...image, fileEntryId: SECOND_ID }]),
        target: { purpose: 'painting', acceptsImages: true, maxImages: 1 },
      }),
    ).rejects.toEqual(new FileAttachmentError({ code: 'count', limit: 1 }));
  });

  test('distinguishes source extraction from request truncation and charges repeated references', async () => {
    const document = { ...text, mediaType: 'application/pdf', name: 'report.pdf' };
    const request = input([document, { ...text, fileEntryId: SECOND_ID }]);
    const result = await prepareFileAttachments({
      ...request,
      historicalFileEntryIds: [FILE_ID],
      readDocumentText: async () => ({ text: 'abc', truncated: true }),
      limits: { maxBytesPerFile: 10, maxCharactersPerFile: 4, maxTotalCharacters: 8 },
    });
    expect(result.get(FILE_ID)).toMatchObject({
      text: 'abc',
      report: { sourceTruncated: true, requestTruncated: false, includedCharacters: 3 },
    });
    expect(result.get(SECOND_ID)).toMatchObject({
      text: 'he',
      report: { sourceTruncated: false, requestTruncated: true, includedCharacters: 2 },
    });
  });

  test('propagates cancellation even when a historical document is being read', async () => {
    const controller = new AbortController();
    const request = input([text]);
    await expect(
      prepareFileAttachments({
        ...request,
        currentFileEntryIds: [],
        historicalFileEntryIds: [FILE_ID],
        signal: controller.signal,
        readBytes: async () => {
          controller.abort(new Error('cancelled'));
          return new Uint8Array();
        },
      }),
    ).rejects.toThrow('cancelled');
  });
});
