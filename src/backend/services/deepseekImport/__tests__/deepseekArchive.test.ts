import type { File } from 'expo-file-system';

import { readDeepseekImageMediaType } from '../deepseekArchive';

jest.mock('expo-file-system', () => ({ FileMode: { ReadOnly: 'r' } }));

function source(name: string, bytes: Uint8Array, size = bytes.length) {
  const handle = { readBytesSync: jest.fn(() => bytes), close: jest.fn() };
  const file = { name, size, open: jest.fn(() => handle) } as unknown as File;
  return { file, handle };
}

test.each(['image_scan', 'image_photo.jpg'])(
  'uses PNG bytes rather than the exported filename %s and reads only a bounded prefix',
  (name) => {
    const { file, handle } = source(
      name,
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      128 * 1024 * 1024,
    );
    expect(readDeepseekImageMediaType(file)).toBe('image/png');
    expect(handle.readBytesSync).toHaveBeenCalledWith(32);
    expect(handle.close).toHaveBeenCalledTimes(1);
  },
);

test.each([
  ['image_photo.heic', 'image/heic'],
  ['image_scan', 'image/*'],
])('retains the archive image identity when the header of %s is unknown', (name, mediaType) => {
  const { file, handle } = source(name, new Uint8Array([1, 2, 3]));
  expect(readDeepseekImageMediaType(file)).toBe(mediaType);
  expect(handle.readBytesSync).toHaveBeenCalledWith(3);
  expect(handle.close).toHaveBeenCalledTimes(1);
});

test('closes a source handle if reading the header fails', () => {
  const { file, handle } = source('image_scan', new Uint8Array());
  handle.readBytesSync.mockImplementation(() => {
    throw new Error('read failed');
  });
  expect(() => readDeepseekImageMediaType(file)).toThrow('read failed');
  expect(handle.close).toHaveBeenCalledTimes(1);
});
