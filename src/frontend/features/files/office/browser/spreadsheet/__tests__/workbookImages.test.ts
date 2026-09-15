import { Blob as NodeBlob } from 'node:buffer';

import { createWorkbookImageUrls } from '../workbookImages';

const createUrl = jest.fn();
const revokeUrl = jest.fn();
const descriptors = Object.getOwnPropertyDescriptors(URL);
const blobDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Blob');

beforeEach(() => {
  // Exercise browser-compatible binary Blobs, independently of jest-expo's native Blob polyfill.
  Object.defineProperty(globalThis, 'Blob', { configurable: true, value: NodeBlob });
  createUrl.mockReset().mockImplementation((blob: Blob) => `blob:${blob.type}`);
  revokeUrl.mockReset();
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: createUrl },
    revokeObjectURL: { configurable: true, value: revokeUrl },
  });
});
afterEach(() => {
  if (blobDescriptor) Object.defineProperty(globalThis, 'Blob', blobDescriptor);
  else Reflect.deleteProperty(globalThis, 'Blob');
  for (const key of ['createObjectURL', 'revokeObjectURL']) {
    if (descriptors[key]) Object.defineProperty(URL, key, descriptors[key]);
    else Reflect.deleteProperty(URL, key);
  }
});

it('retains BMP and WebP alongside the other parser-supported image types and releases all URLs', () => {
  const mimes = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'];
  const images = Object.fromEntries(
    mimes.map((mime, id) => [id, { mime, data: new ArrayBuffer(1) }]),
  );
  const resources = createWorkbookImageUrls(images);
  expect(Object.values(resources.urls)).toEqual(mimes.map((mime) => `blob:${mime}`));
  resources.dispose();
  resources.dispose();
  expect(revokeUrl.mock.calls.map(([url]) => url)).toEqual(mimes.map((mime) => `blob:${mime}`));
});

it('releases already-created URLs if the next resource fails', () => {
  createUrl.mockReturnValueOnce('blob:first').mockImplementationOnce(() => {
    throw new Error('No memory');
  });
  expect(() =>
    createWorkbookImageUrls({
      1: { mime: 'image/png', data: new ArrayBuffer(1) },
      2: { mime: 'image/webp', data: new ArrayBuffer(1) },
    }),
  ).toThrow('No memory');
  expect(revokeUrl).toHaveBeenCalledWith('blob:first');
});
