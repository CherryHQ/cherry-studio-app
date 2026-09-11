import { captureWebp } from '../captureWebp';

const mockPlatform = { OS: 'ios', Version: 26 };
const mockWebpBytes = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
const mockFiles = new Map<string, Uint8Array>();
const mockCapture = jest.fn();
const mockReleaseCapture = jest.fn();
const mockDataDispose = jest.fn();
const mockImageDispose = jest.fn();
const mockEncode = jest.fn();
const mockDecode = jest.fn();
const mockRunWorklet = jest.fn();

jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: (...args: unknown[]) => mockCapture(...args),
  releaseCapture: (uri: string) => mockReleaseCapture(uri),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'capture' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    async bytes() {
      return new Uint8Array([137, 80, 78, 71]);
    }
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { WEBP: 6 },
  Skia: {
    Data: { fromBytes: () => ({ dispose: mockDataDispose }) },
    Image: { MakeImageFromEncoded: (...args: unknown[]) => mockDecode(...args) },
  },
}));
jest.mock('react-native-worklets', () => ({
  createWorkletRuntime: () => ({}),
  runOnRuntimeAsync: (_runtime: unknown, work: () => unknown, source: Uint8Array) =>
    mockRunWorklet(work, source),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockPlatform.OS = 'ios';
  mockPlatform.Version = 26;
  mockCapture.mockResolvedValue('file:///native.png');
  mockEncode.mockReturnValue(mockWebpBytes);
  mockDecode.mockImplementation(() => ({ encodeToBytes: mockEncode, dispose: mockImageDispose }));
  mockRunWorklet.mockImplementation(async (work, source) => work(source));
});

test('Android 10+ captures WebP directly and releases it only once', async () => {
  mockPlatform.OS = 'android';
  mockPlatform.Version = 29;
  mockCapture.mockResolvedValue('file:///native.webm');
  const result = await captureWebp(1, new AbortController().signal);
  expect(mockCapture).toHaveBeenCalledWith(1, {
    format: 'webm',
    quality: 1,
    result: 'tmpfile',
  });
  expect(result.uri).toBe('file:///native.webm');
  expect(mockRunWorklet).not.toHaveBeenCalled();
  expect(mockReleaseCapture).not.toHaveBeenCalled();
  result.release();
  result.release();
  expect(mockReleaseCapture).toHaveBeenCalledTimes(1);
});

test.each(['ios', 'android'])(
  '%s converts the PNG with lossless encoding and owns both files',
  async (os) => {
    mockPlatform.OS = os;
    mockPlatform.Version = 28;
    const result = await captureWebp(1, new AbortController().signal);
    expect(mockCapture).toHaveBeenCalledWith(1, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    expect(mockEncode).toHaveBeenCalledWith(6, 100);
    expect(result.uri).toBe('file:///cache/document-export-capture.webp');
    expect(mockFiles.get(result.uri)).toEqual(mockWebpBytes);
    expect(mockImageDispose).toHaveBeenCalledTimes(1);
    expect(mockDataDispose).toHaveBeenCalledTimes(1);
    expect(mockReleaseCapture).not.toHaveBeenCalled();
    result.release();
    result.release();
    expect(mockReleaseCapture).toHaveBeenCalledTimes(1);
    expect(mockFiles.size).toBe(0);
  },
);

test('cancelling an in-flight capture releases its late file without starting conversion', async () => {
  const native = deferred<string>();
  mockCapture.mockReturnValue(native.promise);
  const controller = new AbortController();
  const pending = captureWebp(1, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  native.resolve('file:///late.png');
  await rejected;
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///late.png');
  expect(mockRunWorklet).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(0);
});

test('cancelling background encoding never writes the late result', async () => {
  const started = deferred<void>();
  const encoded = deferred<Uint8Array>();
  mockRunWorklet.mockImplementation(() => {
    started.resolve();
    return encoded.promise;
  });
  const controller = new AbortController();
  const pending = captureWebp(1, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
  controller.abort();
  encoded.resolve(mockWebpBytes);
  await rejected;
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
  expect(mockFiles.size).toBe(0);
});

test('a decoder failure disposes its data and releases the source file', async () => {
  mockDecode.mockImplementation(() => {
    throw new Error('Decode failed');
  });
  await expect(captureWebp(1, new AbortController().signal)).rejects.toThrow('Decode failed');
  expect(mockDataDispose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
  expect(mockFiles.size).toBe(0);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
