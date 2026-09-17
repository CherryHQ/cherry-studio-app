import {
  discardNormalizedImage,
  IMPORTED_IMAGE_MAX_BYTES,
  normalizeImportedImage,
} from '../importedImageNormalization';

jest.mock('expo-file-system', () => {
  const files = new Map<string, number>();
  return {
    File: class {
      uri: string;
      constructor(value: string) {
        this.uri = value;
      }
      get exists() {
        return files.has(this.uri);
      }
      get extension() {
        return /\.[^./]+$/.exec(this.uri)?.[0] ?? '';
      }
      get name() {
        return this.uri.split('/').pop() ?? '';
      }
      get size() {
        return files.get(this.uri) ?? 0;
      }
      get type() {
        return null;
      }
      delete() {
        files.delete(this.uri);
      }
    },
    testState: { files },
  };
});

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const { testState } = jest.requireMock<{ testState: { files: Map<string, number> } }>(
  'expo-file-system',
);
const { ImageManipulator } = jest.requireMock<{
  ImageManipulator: { manipulate: jest.Mock };
}>('expo-image-manipulator');
const SOURCE = 'file:///picker/IMG_0001.png';
const MIB = 1024 * 1024;

function renderer(sizes: number[]) {
  const source = { width: 4000, height: 3000, release: jest.fn() };
  const sourceContext = { renderAsync: async () => source, release: jest.fn() };
  const contexts: { resize: jest.Mock; release: jest.Mock }[] = [];
  const outputs: { saveAsync: jest.Mock; release: jest.Mock }[] = [];
  ImageManipulator.manipulate
    .mockImplementation(() => {
      const index = outputs.length;
      const output = {
        release: jest.fn(),
        saveAsync: jest.fn(async () => {
          const uri = `file:///cache/encoded-${index}.jpg`;
          testState.files.set(uri, sizes[Math.min(index, sizes.length - 1)]!);
          return { uri };
        }),
      };
      const context = { resize: jest.fn(), release: jest.fn(), renderAsync: async () => output };
      contexts.push(context);
      outputs.push(output);
      return context;
    })
    .mockImplementationOnce(() => sourceContext);
  return { source, sourceContext, contexts, outputs };
}

beforeEach(() => {
  jest.resetAllMocks();
  testState.files.clear();
  testState.files.set(SOURCE, 9 * MIB);
});

test.each([
  ['image/jpeg', 'photo.JPG', 'jpeg', 'image/jpeg', 'photo.JPG'],
  ['image/webp', 'photo.webp', 'webp', 'image/webp', 'photo.webp'],
  ['image/png', 'photo.png', 'jpeg', 'image/jpeg', 'photo.jpg'],
])(
  'bounds an oversized %s named %s',
  async (mediaType, name, format, outputMediaType, outputName) => {
    const native = renderer([700_000]);
    await expect(normalizeImportedImage({ mediaType, name, uri: SOURCE })).resolves.toEqual({
      mediaType: outputMediaType,
      name: outputName,
      uri: 'file:///cache/encoded-0.jpg',
    });
    expect(native.contexts[0]?.resize).toHaveBeenCalledWith({ width: 2048, height: 1536 });
    expect(native.outputs[0]?.saveAsync).toHaveBeenCalledWith({ format, compress: 0.85 });
    expect(testState.files.get(SOURCE)).toBe(9 * MIB);
    expect(native.source.release).toHaveBeenCalledTimes(1);
    expect(native.sourceContext.release).toHaveBeenCalledTimes(1);
    expect(native.outputs[0]?.release).toHaveBeenCalledTimes(1);
    expect(native.contexts[0]?.release).toHaveBeenCalledTimes(1);
  },
);

test('renames from the picked file when the caller supplies no name', async () => {
  renderer([700_000]);
  await expect(normalizeImportedImage({ uri: SOURCE })).resolves.toMatchObject({
    mediaType: 'image/jpeg',
    name: 'IMG_0001.jpg',
  });
});

test('re-renders the original pixels until the encoded file fits, discarding misses', async () => {
  const native = renderer([3 * MIB, 700_000]);
  await expect(
    normalizeImportedImage({ mediaType: 'image/jpeg', uri: SOURCE }),
  ).resolves.toMatchObject({ uri: 'file:///cache/encoded-1.jpg' });
  expect(ImageManipulator.manipulate).toHaveBeenNthCalledWith(3, native.source);
  expect(native.outputs[1]?.saveAsync).toHaveBeenCalledWith({
    format: 'jpeg',
    compress: expect.closeTo(0.8),
  });
  expect([...testState.files.keys()]).toEqual([SOURCE, 'file:///cache/encoded-1.jpg']);
});

test('keeps the original when no attempt fits', async () => {
  renderer([3 * MIB]);
  await expect(
    normalizeImportedImage({ mediaType: 'image/jpeg', uri: SOURCE }),
  ).resolves.toBeUndefined();
  expect([...testState.files.keys()]).toEqual([SOURCE]);
});

test('keeps the original when decoding fails', async () => {
  ImageManipulator.manipulate.mockImplementation(() => {
    throw new Error('Unsupported image');
  });
  await expect(
    normalizeImportedImage({ mediaType: 'image/jpeg', uri: SOURCE }),
  ).resolves.toBeUndefined();
});

test.each([
  ['an image that already fits', 'image/jpeg', IMPORTED_IMAGE_MAX_BYTES],
  ['an animated GIF', 'image/gif', 9 * MIB],
  ['a document', 'application/pdf', 9 * MIB],
])('never decodes %s', async (_label, mediaType, size) => {
  testState.files.set(SOURCE, size);
  await expect(normalizeImportedImage({ mediaType, uri: SOURCE })).resolves.toBeUndefined();
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
});

test('decodes one image at a time', async () => {
  let active = 0;
  let peak = 0;
  ImageManipulator.manipulate.mockImplementation(() => ({
    release: jest.fn(),
    renderAsync: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      throw new Error('stop after decode');
    },
  }));
  await Promise.all(
    [1, 2, 3].map(() => normalizeImportedImage({ mediaType: 'image/jpeg', uri: SOURCE })),
  );
  expect(peak).toBe(1);
});

test('discards the temporary encoded file', async () => {
  renderer([700_000]);
  const normalized = await normalizeImportedImage({ mediaType: 'image/jpeg', uri: SOURCE });
  discardNormalizedImage(normalized!);
  expect([...testState.files.keys()]).toEqual([SOURCE]);
});
