import { ImageFormat, Skia } from '@shopify/react-native-skia';

import { imageEditGeometry } from '@/shared/utils/imageEditGeometry';

import { renderEditedImage } from '../renderEditedImage';

jest.mock('@shopify/react-native-skia', () => ({
  FilterMode: { Linear: 'linear' },
  MipmapMode: { None: 'none' },
  ImageFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  Skia: {
    Data: { fromURI: jest.fn() },
    Image: { MakeImageFromEncoded: jest.fn() },
    Surface: { Make: jest.fn() },
    XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'edit' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    create() {}
  },
  File: class {
    uri = 'file:///cache/edit.png';
    exists = true;
    writeSync = mockWrite;
    delete = mockDelete;
  },
}));

const mockWrite = jest.fn();
const mockDelete = jest.fn();
const data = { dispose: jest.fn() };
const image = { width: () => 800, height: () => 600, dispose: jest.fn() };
const canvas = { translate: jest.fn(), concat: jest.fn(), drawImageRectOptions: jest.fn() };
const snapshot = { dispose: jest.fn(), encodeToBytes: jest.fn(() => new Uint8Array([1, 2, 3])) };
const surface = {
  dispose: jest.fn(),
  flush: jest.fn(),
  getCanvas: () => canvas,
  makeImageSnapshot: () => snapshot,
};
const edit = { rotation: 90 as const, crop: { x: 0.25, y: 0.1, width: 0.75, height: 0.8 } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Skia.Data.fromURI).mockResolvedValue(data as never);
  jest.mocked(Skia.Image.MakeImageFromEncoded).mockReturnValue(image as never);
  jest.mocked(Skia.Surface.Make).mockReturnValue(surface as never);
});

test.each([
  ['image/png', ImageFormat.PNG],
  ['image/jpeg', ImageFormat.JPEG],
  ['image/webp', ImageFormat.WEBP],
])('preserves %s encoding and quarter-turn pixel bounds', async (mediaType, format) => {
  const result = await renderEditedImage('file:///source', mediaType, edit);
  expect(Skia.Surface.Make).toHaveBeenCalledWith(450, 640);
  expect(canvas.translate).toHaveBeenCalledWith(-150, -80);
  expect(snapshot.encodeToBytes).toHaveBeenCalledWith(format, 100);
  expect(mockWrite).toHaveBeenCalledTimes(1);
  for (const resource of [data, image, surface, snapshot])
    expect(resource.dispose).toHaveBeenCalledTimes(1);
  expect(mockDelete).not.toHaveBeenCalled();
  result.release();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test('combined perspective, straightening and mirroring use the same matrix as preview', async () => {
  const transform = {
    ...edit,
    straighten: 13,
    horizontal: -20,
    vertical: 11,
    flipHorizontal: true,
  };
  const geometry = imageEditGeometry(transform, { width: 800, height: 600 });
  await renderEditedImage('file:///source', 'image/png', { ...transform, crop: geometry.bounds });
  expect(canvas.concat).toHaveBeenCalledWith(geometry.matrix);
});

test('rejects blank-wedge crops and disposes decoding resources before allocating output', async () => {
  await expect(
    renderEditedImage('file:///source', 'image/png', { ...edit, straighten: 20 }),
  ).rejects.toThrow('outside');
  expect(Skia.Surface.Make).not.toHaveBeenCalled();
  expect(data.dispose).toHaveBeenCalledTimes(1);
  expect(image.dispose).toHaveBeenCalledTimes(1);
});

test('aborting during decoding prevents raster allocation and releases decoded data', async () => {
  const controller = new AbortController();
  jest.mocked(Skia.Data.fromURI).mockImplementation(async () => {
    controller.abort();
    return data as never;
  });
  await expect(
    renderEditedImage('file:///source', 'image/png', edit, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(Skia.Surface.Make).not.toHaveBeenCalled();
  expect(data.dispose).toHaveBeenCalledTimes(1);
});
