import { captureWebp } from '../captureWebp';
import type { ImageCapturePlan } from '../imageCapturePlan';

const mockWebpBytes = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
const mockFiles = new Map<string, Uint8Array>();
const mockCapture = jest.fn();
const mockReleaseCapture = jest.fn();
const mockDataDispose = jest.fn();
const mockImageDispose = jest.fn();
const mockEncode = jest.fn();
const mockDecode = jest.fn();
const mockRunWorklet = jest.fn();
const mockRuntimeUse = jest.fn();
let mockRuntimeCount = 0;
const mockCreateRuntime = jest.fn(() => ({ runtime: ++mockRuntimeCount }));
const plan: ImageCapturePlan = {
  width: 720,
  height: 3600,
  scale: 2,
  layoutHeight: 1800,
};

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
  createWorkletRuntime: () => mockCreateRuntime(),
  runOnRuntimeAsync: (
    runtime: unknown,
    work: (...args: unknown[]) => unknown,
    ...args: unknown[]
  ) => {
    mockRuntimeUse(runtime);
    return mockRunWorklet(work, ...args);
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockCapture.mockResolvedValue('file:///native.png');
  mockEncode.mockReturnValue(mockWebpBytes);
  mockDecode.mockImplementation(() => ({
    width: () => 720,
    height: () => 3600,
    encodeToBytes: mockEncode,
    dispose: mockImageDispose,
  }));
  mockRunWorklet.mockImplementation(async (work, ...args) => work(...args));
});

test('captures the whole image once and releases its PNG before returning lossless WebP', async () => {
  const result = await captureWebp(1, plan, new AbortController().signal);
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(mockCapture).toHaveBeenCalledWith(1, { format: 'png', result: 'tmpfile' });
  expect(mockEncode).toHaveBeenCalledWith(6, 100);
  expect(mockFiles.get(result.uri)).toEqual(mockWebpBytes);
  expect(result).toMatchObject({ width: 720, height: 3600 });
  expect(mockImageDispose).toHaveBeenCalledTimes(1);
  expect(mockDataDispose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledTimes(1);
  result.release();
  result.release();
  expect(mockFiles.size).toBe(0);
});

test('rejects a clipped screenshot without publishing an incomplete image', async () => {
  mockDecode.mockImplementation(() => ({
    width: () => 720,
    height: () => 1024,
    encodeToBytes: mockEncode,
    dispose: mockImageDispose,
  }));
  await expect(captureWebp(1, plan, new AbortController().signal)).rejects.toThrow(
    'Screenshot dimensions changed',
  );
  expect(mockEncode).not.toHaveBeenCalled();
  expect(mockImageDispose).toHaveBeenCalledTimes(1);
  expect(mockDataDispose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
  expect(mockFiles.size).toBe(0);
});

test('cancelling an in-flight capture releases its late file without starting conversion', async () => {
  const native = deferred<string>();
  const started = deferred<void>();
  mockCapture.mockImplementation(() => {
    started.resolve();
    return native.promise;
  });
  const controller = new AbortController();
  const pending = captureWebp(1, plan, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
  controller.abort();
  native.resolve('file:///late.png');
  await rejected;
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///late.png');
  expect(mockDecode).not.toHaveBeenCalled();
  expect(mockEncode).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(0);
});

test('cancelling background encoding never writes the late result', async () => {
  const started = deferred<void>();
  const encoded = deferred<{ bytes: Uint8Array; width: number; height: number }>();
  mockRunWorklet.mockImplementation(() => {
    started.resolve();
    return encoded.promise;
  });
  const controller = new AbortController();
  const pending = captureWebp(1, plan, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
  controller.abort();
  encoded.resolve({ bytes: mockWebpBytes, width: 720, height: 3600 });
  await rejected;
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
  expect(mockFiles.size).toBe(0);
});

test('a decoder failure disposes its data without publishing an image', async () => {
  mockDecode.mockImplementation(() => {
    throw new Error('Decode failed');
  });
  await expect(captureWebp(1, plan, new AbortController().signal)).rejects.toThrow('Decode failed');
  expect(mockDataDispose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
  expect(mockFiles.size).toBe(0);
});

test('every capture shares one worklet runtime', async () => {
  (await captureWebp(1, plan, new AbortController().signal)).release();
  (await captureWebp(1, plan, new AbortController().signal)).release();
  expect(mockRuntimeUse).toHaveBeenCalledTimes(2);
  expect(new Set(mockRuntimeUse.mock.calls.map(([runtime]) => runtime)).size).toBe(1);
  expect(mockCreateRuntime.mock.calls.length).toBeLessThanOrEqual(1);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
