import { decodeFileText, FILE_VIEWER_MAX_BYTES, readFileText } from '../readFileText';

const mockRead = jest.fn();
const mockClose = jest.fn();
const mockOpen = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({ open: (mode: string) => mockOpen(mode) })),
  FileMode: { ReadOnly: 'r' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockOpen.mockReturnValue({ close: mockClose, readBytes: mockRead });
});

it('reads bounded bytes with a read-only handle and always closes it', () => {
  mockRead.mockReturnValue(new TextEncoder().encode('hello'));
  expect(readFileText('file:///note.txt')).toEqual({ isTruncated: false, text: 'hello' });
  expect(mockOpen).toHaveBeenCalledWith('r');
  expect(mockRead).toHaveBeenCalledWith(FILE_VIEWER_MAX_BYTES + 1);
  expect(mockClose).toHaveBeenCalledTimes(1);
});

it('closes the handle if the read fails', () => {
  mockRead.mockImplementationOnce(() => {
    throw new Error('unreadable');
  });
  expect(() => readFileText('file:///note.txt')).toThrow('unreadable');
  expect(mockClose).toHaveBeenCalledTimes(1);
});

it('removes a UTF-8 BOM, preserves Unicode and allows an empty file', () => {
  expect(decodeFileText(new TextEncoder().encode('\uFEFF你好 🌸'))).toEqual({
    isTruncated: false,
    text: '你好 🌸',
  });
  expect(decodeFileText(new Uint8Array())).toEqual({ isTruncated: false, text: '' });
});

it('replaces invalid UTF-8 and rejects NUL-bearing binary content', () => {
  expect(decodeFileText(new Uint8Array([0xff])).text).toBe('\uFFFD');
  expect(() => decodeFileText(new Uint8Array([65, 0, 66]))).toThrow('Binary content');
});

it('only marks files beyond the limit as truncated and never splits a character', () => {
  const exact = new Uint8Array(FILE_VIEWER_MAX_BYTES).fill(65);
  expect(decodeFileText(exact).isTruncated).toBe(false);
  const larger = new Uint8Array(FILE_VIEWER_MAX_BYTES + 2).fill(65);
  larger.set(new TextEncoder().encode('中'), FILE_VIEWER_MAX_BYTES - 1);
  const result = decodeFileText(larger);
  expect(result.isTruncated).toBe(true);
  expect(result.text).toBe('A'.repeat(FILE_VIEWER_MAX_BYTES - 1));
});
