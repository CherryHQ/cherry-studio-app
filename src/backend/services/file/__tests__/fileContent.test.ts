import { FileEntrySchema } from '@/shared/data/types/file';
import { MAX_IMAGE_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { fileContent } from '../fileContent';
import { createInternalEntryWithPreview } from '../filePreviewStorage';
import { readFileUriBytes, resolveFileEntry } from '../fileStorage';

const FILE_ID = '00000000-0000-7000-8000-000000000001';
const mockSize = { value: 8 };

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({
    get size() {
      return mockSize.value;
    },
  })),
}));
jest.mock('@/backend/data/services/FileEntryService', () => ({ fileEntryService: {} }));
jest.mock('../documentText', () => ({
  DocumentTextError: class extends Error {},
  readDocumentUriText: jest.fn(),
}));
jest.mock('../fileStorage', () => ({ resolveFileEntry: jest.fn(), readFileUriBytes: jest.fn() }));
jest.mock('../filePreviewStorage', () => ({ createInternalEntryWithPreview: jest.fn() }));

function resolvedFile(mediaType = 'text/plain') {
  return {
    entry: FileEntrySchema.parse({
      id: FILE_ID,
      filename: 'notes.txt',
      mediaType,
      size: 1,
      provenance: 'imported',
      createdAt: 1,
      updatedAt: 1,
    }),
    uri: 'file:///managed/notes.txt',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSize.value = 8;
  jest.mocked(resolveFileEntry).mockResolvedValue(resolvedFile());
  jest.mocked(readFileUriBytes).mockResolvedValue(new TextEncoder().encode('hello'));
});

describe('fileContent attachment boundary', () => {
  test('imports without parsing, then resolves library metadata and text on submission', async () => {
    jest.mocked(createInternalEntryWithPreview).mockResolvedValue(resolvedFile().entry);
    await fileContent.createInternalEntry({
      uri: 'file:///picker/file',
      name: 'picker-name',
      mediaType: 'application/octet-stream',
    });
    expect(readFileUriBytes).not.toHaveBeenCalled();
    const prepared = await fileContent.prepareAttachments({
      fileEntryIds: [FILE_ID],
      target: { purpose: 'chat', acceptsImages: false },
    });
    expect(prepared).toEqual([
      {
        ...resolvedFile(),
        text: 'hello',
        report: {
          mode: 'text',
          sourceTruncated: false,
          requestTruncated: false,
          includedCharacters: 5,
        },
      },
    ]);
    expect(createInternalEntryWithPreview).toHaveBeenCalledTimes(1);
  });

  test('uses actual managed size when a stored image size is stale', async () => {
    jest.mocked(resolveFileEntry).mockResolvedValue(resolvedFile('image/png'));
    mockSize.value = MAX_IMAGE_ATTACHMENT_BYTES + 1;
    await expect(
      fileContent.prepareAttachments({
        fileEntryIds: [FILE_ID],
        target: { purpose: 'painting', acceptsImages: true },
      }),
    ).rejects.toMatchObject({ issue: { code: 'file-bytes', limit: MAX_IMAGE_ATTACHMENT_BYTES } });
    expect(readFileUriBytes).not.toHaveBeenCalled();
  });

  test('redacts failed native resolution and preserves cancellation', async () => {
    jest.mocked(resolveFileEntry).mockRejectedValue(new Error('file:///private/device/path'));
    await expect(
      fileContent.prepareAttachments({
        fileEntryIds: [FILE_ID],
        target: { purpose: 'chat', acceptsImages: true },
      }),
    ).rejects.toMatchObject({
      issue: { code: 'unavailable', fileEntryId: FILE_ID },
      message: 'Attachment "": unavailable',
    });
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      fileContent.prepareAttachments({
        fileEntryIds: [FILE_ID],
        target: { purpose: 'chat', acceptsImages: true },
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
  });
});
