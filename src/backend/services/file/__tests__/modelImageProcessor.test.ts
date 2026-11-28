import { fromByteArray } from 'base64-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { createNativeModelImageProcessor } from '../modelImageProcessor';

const mockFiles = new Map<string, Uint8Array>();
const mockCreatedDirs = new Set<string>();
let mockFileId = 0;
let mockWriteDelay: (() => Promise<void>) | undefined;

jest.mock('expo-crypto', () => ({ randomUUID: () => String(++mockFileId) }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() {
      mockCreatedDirs.add(this.uri);
    }
  },
  File: class {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, new Uint8Array());
    }
    async write(bytes: Uint8Array) {
      await (mockWriteDelay ? mockWriteDelay() : Promise.resolve());
      mockFiles.set(this.uri, bytes);
    }
    async bytes() {
      return mockFiles.get(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const limits = { maxWidth: 800, maxHeight: 600, maxBytes: 64 };
type Dimensions = { width: number; height: number };
const manipulate = jest.mocked(ImageManipulator.manipulate);

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function makePng(width: number, height: number, animated = false): Uint8Array {
  const bytes = new Uint8Array(animated ? 41 : 24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  if (animated) bytes.set([0x61, 0x63, 0x54, 0x4c], 37); // acTL marker after IHDR
  return bytes;
}

function makeJpeg(width: number, height: number, orientation?: number): Uint8Array {
  const sof = new Uint8Array([0xff, 0xc0, 0x00, 0x08, 0x08, 0, 0, 0, 0, 0]);
  const sofView = new DataView(sof.buffer);
  sofView.setUint16(5, height, false);
  sofView.setUint16(7, width, false);
  if (orientation === undefined) return concatBytes(new Uint8Array([0xff, 0xd8]), sof);

  const exif = new Uint8Array(36);
  const exifView = new DataView(exif.buffer);
  exif.set([0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a], 0);
  exifView.setUint32(14, 8, false);
  exifView.setUint16(18, 1, false);
  exifView.setUint16(20, 0x0112, false);
  exifView.setUint16(22, 3, false);
  exifView.setUint32(24, 1, false);
  exifView.setUint16(28, orientation, false);
  return concatBytes(new Uint8Array([0xff, 0xd8]), exif, sof);
}

function makeWebp(width: number, height: number, animated = false): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  const view = new DataView(bytes.buffer);
  if (!animated) {
    bytes.set([0x56, 0x50, 0x38, 0x20], 12);
    view.setUint16(26, width & 0x3fff, true);
    view.setUint16(28, height & 0x3fff, true);
    return bytes;
  }
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  view.setUint32(16, 10, true);
  bytes[20] = 0x02;
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >>> 8) & 0xff;
  bytes[26] = (w >>> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >>> 8) & 0xff;
  bytes[29] = (h >>> 16) & 0xff;
  return bytes;
}

function makeGif(width: number, height: number, animated = false): Uint8Array {
  const header = new Uint8Array(13);
  header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  const view = new DataView(header.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  const frame = new Uint8Array([0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0x01, 0, 0]);
  return concatBytes(header, frame, ...(animated ? [frame] : []), new Uint8Array([0x3b]));
}

function makeBmp(width = 800, height = 600): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d], 0);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  return bytes;
}

function sampleForMime(mimeType: string, width = 800, height = 600): Uint8Array {
  switch (mimeType) {
    case 'image/jpeg':
      return makeJpeg(width, height);
    case 'image/png':
      return makePng(width, height);
    case 'image/webp':
      return makeWebp(width, height);
    case 'image/gif':
      return makeGif(width, height);
    default:
      throw new Error(`Unsupported test fixture MIME: ${mimeType}`);
  }
}

function nativeFixture({
  pixelSize = { width: 800, height: 600 },
  outputSizes = [],
  decode = async () => {},
}: {
  pixelSize?: Dimensions;
  outputSizes?: number[];
  decode?: () => Promise<void>;
} = {}) {
  const save = jest.fn();
  const resize = jest.fn();
  const release = jest.fn();
  const readSource = jest.fn();
  let outputIndex = 0;
  manipulate.mockClear();
  manipulate.mockImplementation((source) => {
    let dimensions = pixelSize;
    return {
      resize(size: Dimensions) {
        resize(size);
        dimensions = size;
      },
      release,
      async renderAsync() {
        if (typeof source === 'string') {
          readSource(mockFiles.get(source));
          await decode();
        }
        return {
          ...dimensions,
          release,
          async saveAsync(options: unknown) {
            save(options);
            const uri = `file:///cache/ImageManipulator/output-${outputIndex}`;
            mockFiles.set(uri, new Uint8Array(outputSizes[outputIndex++] ?? 0));
            return { uri, ...dimensions };
          },
        };
      },
    } as unknown as ReturnType<typeof ImageManipulator.manipulate>;
  });
  return { readSource, save, resize, release };
}

beforeEach(() => {
  mockFiles.clear();
  mockWriteDelay = undefined;
  manipulate.mockReset();
});

afterEach(() => {
  expect(mockFiles.size).toBe(0);
});

test.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])(
  'passes a decoded %s through byte for byte at the dimension and base64 limits',
  async (mimeType) => {
    const { readSource, resize, save, release } = nativeFixture();
    const bytes = sampleForMime(mimeType, 800, 600);
    await expect(
      createNativeModelImageProcessor().prepare(bytes, mimeType, limits),
    ).resolves.toEqual({ data: fromByteArray(bytes), mimeType });
    expect(manipulate).toHaveBeenCalledWith(expect.any(String), {
      maxWidth: limits.maxWidth,
      maxHeight: limits.maxHeight,
    });
    expect(readSource).toHaveBeenCalledWith(bytes);
    expect(resize).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(2);
  },
);

test('rejects raw byte sizes whose base64 rounds up past the budget and retries smaller', async () => {
  const { save, resize, release } = nativeFixture({ outputSizes: [4, 3] });
  const result = await createNativeModelImageProcessor().prepare(makeJpeg(800, 600), 'image/jpeg', {
    ...limits,
    maxBytes: 6,
  });
  expect(save.mock.calls).toEqual([
    [{ format: SaveFormat.JPEG, compress: 0.85 }],
    [{ format: SaveFormat.JPEG, compress: 0.8 }],
  ]);
  expect(resize).toHaveBeenCalledWith({ width: 640, height: 480 });
  expect(result).toEqual({
    data: 'AAAA',
    mimeType: 'image/jpeg',
    resized: { from: { width: 800, height: 600 }, to: { width: 640, height: 480 } },
  });
  expect(release).toHaveBeenCalledTimes(6);
});

test('preserves alpha on resized PNG when it fits and falls back to JPEG when too large', async () => {
  const fit = nativeFixture({ pixelSize: { width: 1600, height: 800 }, outputSizes: [3] });
  await expect(
    createNativeModelImageProcessor().prepare(makePng(1600, 800), 'image/png', limits),
  ).resolves.toEqual({
    data: 'AAAA',
    mimeType: 'image/png',
    resized: { from: { width: 1600, height: 800 }, to: { width: 800, height: 400 } },
  });
  expect(fit.save).toHaveBeenCalledWith({ format: SaveFormat.PNG });

  const fallback = nativeFixture({
    pixelSize: { width: 1600, height: 800 },
    outputSizes: [100, 3],
  });
  await expect(
    createNativeModelImageProcessor().prepare(makePng(1600, 800), 'image/png', limits),
  ).resolves.toEqual({
    data: 'AAAA',
    mimeType: 'image/jpeg',
    resized: { from: { width: 1600, height: 800 }, to: { width: 800, height: 400 } },
    convertedFrom: 'image/png',
  });
  expect(fallback.save.mock.calls).toEqual([
    [{ format: SaveFormat.PNG }],
    [{ format: SaveFormat.JPEG, compress: 0.85 }],
  ]);
});

test('resizes and converts image/bmp and single-frame GIF to JPEG with model metadata', async () => {
  const bmp = nativeFixture({ pixelSize: { width: 1600, height: 800 }, outputSizes: [3] });
  await expect(
    createNativeModelImageProcessor().prepare(makeBmp(1600, 800), 'image/bmp', limits),
  ).resolves.toEqual({
    data: 'AAAA',
    mimeType: 'image/jpeg',
    resized: { from: { width: 1600, height: 800 }, to: { width: 800, height: 400 } },
    convertedFrom: 'image/bmp',
  });
  expect(bmp.save).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.85 });

  const gif = nativeFixture({ pixelSize: { width: 800, height: 599 }, outputSizes: [3] });
  await expect(
    createNativeModelImageProcessor().prepare(makeGif(801, 600), 'image/gif', limits),
  ).resolves.toEqual({
    data: 'AAAA',
    mimeType: 'image/jpeg',
    resized: { from: { width: 801, height: 600 }, to: { width: 800, height: 599 } },
    convertedFrom: 'image/gif',
  });
  expect(gif.save).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.85 });
});

test('downsamples an oversized PNG via decode bounds without extra resize', async () => {
  const { save, resize, release } = nativeFixture({
    pixelSize: { width: 600, height: 600 },
    outputSizes: [3],
  });
  await expect(
    createNativeModelImageProcessor().prepare(makePng(20_000, 20_000), 'image/png', limits),
  ).resolves.toEqual({
    data: 'AAAA',
    mimeType: 'image/png',
    resized: { from: { width: 20_000, height: 20_000 }, to: { width: 600, height: 600 } },
  });
  expect(resize).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledWith({ format: SaveFormat.PNG });
  expect(release).toHaveBeenCalledTimes(4);
});

test.each([
  [
    'HEIC container mislabeled as image/png',
    new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]),
    'image/png',
  ],
  ['animated PNG (APNG)', makePng(100, 100, true), 'image/png'],
  ['truncated JPEG without SOF header', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg'],
  ['short BMP header', new Uint8Array([0x42, 0x4d, 26, 0, 0, 0]), 'image/bmp'],
  ['oversized animated WebP', makeWebp(1200, 900, true), 'image/webp'],
  ['oversized animated GIF', makeGif(801, 600, true), 'image/gif'],
])('omits %s before native decode', async (_label, bytes, declaredMime) => {
  nativeFixture({ pixelSize: { width: 800, height: 600 }, outputSizes: [3] });
  await expect(
    createNativeModelImageProcessor().prepare(bytes, declaredMime, limits),
  ).resolves.toBeUndefined();
  expect(manipulate).not.toHaveBeenCalled();
});

test('keeps animated WebP within limits intact', async () => {
  const animatedWebp = makeWebp(400, 300, true);
  const { save } = nativeFixture({ pixelSize: { width: 400, height: 300 } });
  await expect(
    createNativeModelImageProcessor().prepare(animatedWebp, 'image/webp', {
      ...limits,
      maxBytes: 256,
    }),
  ).resolves.toEqual({ data: fromByteArray(animatedWebp), mimeType: 'image/webp' });
  expect(save).not.toHaveBeenCalled();
});

test('accounts for EXIF orientation and normalizes oriented JPEGs within limits', async () => {
  nativeFixture({ pixelSize: { width: 600, height: 800 }, outputSizes: [3] });
  await expect(
    createNativeModelImageProcessor().prepare(makeJpeg(1600, 1200, 6), 'image/jpeg', limits),
  ).resolves.toEqual({
    data: 'AAAA',
    mimeType: 'image/jpeg',
    resized: { from: { width: 1200, height: 1600 }, to: { width: 450, height: 600 } },
  });

  const { save } = nativeFixture({ pixelSize: { width: 400, height: 600 }, outputSizes: [3] });
  await expect(
    createNativeModelImageProcessor().prepare(makeJpeg(600, 400, 6), 'image/jpeg', {
      ...limits,
      maxBytes: 256,
    }),
  ).resolves.toEqual({ data: 'AAAA', mimeType: 'image/jpeg' });
  expect(save).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.85 });
});

test('caps WebP attempts, rejects zero decoded dimensions, and serializes async writes/decodes', async () => {
  const { save } = nativeFixture({ outputSizes: [100, 100, 100, 100, 100] });
  await expect(
    createNativeModelImageProcessor().prepare(makeWebp(1600, 1200), 'image/webp', limits),
  ).resolves.toBeUndefined();
  expect(save).toHaveBeenCalledTimes(5);

  nativeFixture({ pixelSize: { width: 0, height: 600 } });
  await expect(
    createNativeModelImageProcessor().prepare(makePng(800, 600), 'image/png', limits),
  ).resolves.toBeUndefined();

  const png = makePng(100, 100);
  let releaseWrite!: () => void;
  mockWriteDelay = () =>
    new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
  const { readSource } = nativeFixture({ pixelSize: { width: 100, height: 100 } });
  const pendingWrite = createNativeModelImageProcessor().prepare(png, 'image/png', {
    ...limits,
    maxBytes: 256,
  });
  await Promise.resolve();
  expect(manipulate).not.toHaveBeenCalled();
  releaseWrite();
  await expect(pendingWrite).resolves.toEqual({ data: fromByteArray(png), mimeType: 'image/png' });
  expect(readSource).toHaveBeenCalledWith(png);
  mockWriteDelay = undefined;

  let markDecodeStarted!: () => void;
  const decodeStarted = new Promise<void>((resolve) => {
    markDecodeStarted = resolve;
  });
  let finishDecode!: () => void;
  const decodeGate = new Promise<void>((resolve) => {
    finishDecode = resolve;
  });
  const decode = jest
    .fn(async () => {})
    .mockImplementationOnce(async () => {
      markDecodeStarted();
      await decodeGate;
      throw new Error('Corrupt image');
    });
  manipulate.mockReset();
  const { release } = nativeFixture({ decode });
  const processor = createNativeModelImageProcessor();
  const first = processor.prepare(makePng(100, 100), 'image/png', limits);
  const second = processor.prepare(png, 'image/png', limits);
  await decodeStarted;
  try {
    expect(manipulate).toHaveBeenCalledTimes(1);
    expect(mockCreatedDirs.has('file:///cache/ModelImages')).toBe(true);
    expect(mockFiles.size).toBe(1);
  } finally {
    finishDecode();
  }
  await expect(first).resolves.toBeUndefined();
  await expect(second).resolves.toEqual({ data: fromByteArray(png), mimeType: 'image/png' });
  expect(release).toHaveBeenCalledTimes(3);
});
