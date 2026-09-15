import { readPngDimensions } from '../readPngDimensions';

const mockReadBytes = jest.fn();
const mockClose = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({ open: () => ({ readBytes: mockReadBytes, close: mockClose }) })),
  FileMode: { ReadOnly: 'r' },
}));

beforeEach(() => jest.clearAllMocks());

test('reads only the header of a long exported image and closes its handle', () => {
  const bytes = new Uint8Array(24);
  const header = new DataView(bytes.buffer);
  [0x89504e47, 0x0d0a1a0a, 13, 0x49484452, 1080, 150000].forEach((value, index) =>
    header.setUint32(index * 4, value),
  );
  mockReadBytes.mockReturnValue(bytes);
  expect(readPngDimensions('file:///large.png')).toEqual({ width: 1080, height: 150000 });
  expect(mockReadBytes).toHaveBeenCalledWith(24);
  expect(mockClose).toHaveBeenCalledTimes(1);
});

test('rejects a truncated header without passing it to an image decoder', () => {
  mockReadBytes.mockReturnValue(new Uint8Array(8));
  expect(readPngDimensions('file:///invalid.png')).toBeUndefined();
  expect(mockClose).toHaveBeenCalledTimes(1);
});
