import { FileEntrySchema } from '@/shared/data/types/file';

import { OFFICE_CHUNK_BYTES } from '../officePreview';
import { createOfficeFileReader } from '../readOfficeFile';

const mockInfo = jest.fn();
const mockRead = jest.fn();
const mockClose = jest.fn();
const mockOpen = jest.fn(() => ({ offset: 0, readBytes: mockRead, close: mockClose }));
jest.mock('expo-file-system', () => ({
  File: class {
    info = mockInfo;
    open = mockOpen;
  },
  FileMode: { ReadOnly: 'r' },
}));

const file = {
  entry: FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'report.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    createdAt: 1,
    updatedAt: 2,
    size: 4,
    provenance: 'generated',
  }),
  uri: 'file:///managed/report.docx',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockInfo.mockReturnValue({ exists: true, size: 4, modificationTime: 2 });
  mockRead.mockReturnValue(new Uint8Array([0, 127, 128, 255]));
});

it('transfers binary bytes exactly and closes the file before returning', async () => {
  const reader = createOfficeFileReader(file.uri, 'docx');
  expect(await reader.getSize()).toBe(4);
  expect(await reader.readChunk(0, 4)).toBe('AH+A/w==');
  expect(mockClose).toHaveBeenCalledTimes(1);
  await expect(reader.readChunk(0, 4)).rejects.toThrow('Invalid Office read range');
});

it.each([
  [-1, 1],
  [0, 0],
  [0, 5],
  [1, 1],
  [0, OFFICE_CHUNK_BYTES + 1],
  [NaN, 1],
  [0, 0.5],
])(
  'refuses an invalid or nonsequential range %s/%s without opening the file',
  async (offset, length) => {
    const reader = createOfficeFileReader(file.uri, 'docx');
    await reader.getSize();
    await expect(reader.readChunk(offset, length)).rejects.toThrow('Invalid Office read range');
    expect(mockOpen).not.toHaveBeenCalled();
  },
);

it('refuses changed, oversized and disposed sources', async () => {
  const reader = createOfficeFileReader(file.uri, 'docx');
  await reader.getSize();
  mockInfo.mockReturnValue({ exists: true, size: 4, modificationTime: 3 });
  await expect(reader.readChunk(0, 4)).rejects.toThrow('Office file changed');
  mockInfo.mockReturnValue({ exists: true, size: 26 * 1024 * 1024 });
  expect(await reader.getSize()).toBe(-1);
  reader.dispose();
  await expect(reader.readChunk(0, 4)).rejects.toThrow();
  expect(mockOpen).not.toHaveBeenCalled();
});

it('closes a failed read and does not advance the range', async () => {
  const reader = createOfficeFileReader(file.uri, 'docx');
  await reader.getSize();
  mockRead.mockImplementationOnce(() => {
    throw new Error('Read failed');
  });
  await expect(reader.readChunk(0, 4)).rejects.toThrow('Read failed');
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(await reader.readChunk(0, 4)).toBe('AH+A/w==');
});
