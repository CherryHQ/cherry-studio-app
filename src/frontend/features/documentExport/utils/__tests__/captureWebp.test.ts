import { captureWebp } from '../captureWebp';
import type { ImageCapturePlan } from '../imageCapturePlan';

const mockWebpBytes = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
const mockFiles = new Map<string, Uint8Array>();
const mockCapture = jest.fn();
const mockReleaseCapture = jest.fn();
const mockDataDispose = jest.fn();
const mockImageDispose = jest.fn();
const mockSurfaceDispose = jest.fn();
const mockSnapshotDispose = jest.fn();
const mockEncode = jest.fn();
const mockDecode = jest.fn();
const mockDraw = jest.fn();
const mockRunWorklet = jest.fn();
const mockPrepareTile = jest.fn(async () => {});
const plan: ImageCapturePlan = {
  width: 720,
  height: 900,
  scale: 2,
  layoutHeight: 450,
  tiles: [{ offset: 0, height: 900 }],
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
    XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    Paint: () => ({ dispose: jest.fn() }),
    Surface: {
      Make: () => ({
        getCanvas: () => ({ drawImageRect: mockDraw }),
        makeImageSnapshot: () => ({ encodeToBytes: mockEncode, dispose: mockSnapshotDispose }),
        dispose: mockSurfaceDispose,
      }),
    },
  },
}));
jest.mock('react-native-worklets', () => ({
  createWorkletRuntime: ({ initializer }: { initializer?: () => void } = {}) => {
    initializer?.();
    return {};
  },
  runOnRuntimeAsync: (
    _runtime: unknown,
    work: (...args: unknown[]) => unknown,
    ...args: unknown[]
  ) => mockRunWorklet(work, ...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockCapture.mockResolvedValue('file:///native.png');
  mockEncode.mockReturnValue(mockWebpBytes);
  mockDecode.mockImplementation(() => ({
    width: () => 720,
    height: () => 900,
    dispose: mockImageDispose,
  }));
  mockRunWorklet.mockImplementation(async (work, ...args) => work(...args));
});

test('encodes lossless WebP and releases tile files before returning the retained result', async () => {
  const result = await captureWebp(1, plan, mockPrepareTile, new AbortController().signal);
  expect(mockCapture).toHaveBeenCalledWith(1, { format: 'png', result: 'tmpfile' });
  expect(mockEncode).toHaveBeenCalledWith(6, 100);
  expect(mockFiles.get(result.uri)).toEqual(mockWebpBytes);
  expect(mockImageDispose).toHaveBeenCalledTimes(1);
  expect(mockDataDispose).toHaveBeenCalledTimes(1);
  expect(mockSurfaceDispose).toHaveBeenCalledTimes(1);
  expect(mockSnapshotDispose).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledTimes(1);
  result.release();
  result.release();
  expect(mockFiles.size).toBe(0);
});

test('waits for tile layout and assembles tiles in order before one encode', async () => {
  const firstLayout = deferred<void>();
  const started = deferred<void>();
  mockPrepareTile.mockImplementationOnce(() => {
    started.resolve();
    return firstLayout.promise;
  });
  mockDecode.mockImplementation(() => ({
    width: () => 720,
    height: () => 1024,
    dispose: mockImageDispose,
  }));
  const tiledPlan = {
    ...plan,
    height: 2048,
    layoutHeight: 1024,
    tiles: [
      { offset: 0, height: 1024 },
      { offset: 1024, height: 1024 },
    ],
  };
  const pending = captureWebp(1, tiledPlan, mockPrepareTile, new AbortController().signal);
  await started.promise;
  expect(mockCapture).not.toHaveBeenCalled();
  firstLayout.resolve();
  const result = await pending;
  expect(mockPrepareTile.mock.calls).toEqual(tiledPlan.tiles.map((tile) => [tile]));
  expect(mockDraw.mock.calls.map((call) => call[2])).toEqual([
    { x: 0, y: 0, width: 720, height: 1024 },
    { x: 0, y: 1024, width: 720, height: 1024 },
  ]);
  expect(mockEncode).toHaveBeenCalledTimes(1);
  expect(mockReleaseCapture).toHaveBeenCalledTimes(2);
  result.release();
});

test('cancelling an in-flight capture releases its late file without starting conversion', async () => {
  const native = deferred<string>();
  const started = deferred<void>();
  mockCapture.mockImplementation(() => {
    started.resolve();
    return native.promise;
  });
  const controller = new AbortController();
  const pending = captureWebp(1, plan, mockPrepareTile, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
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
  mockRunWorklet.mockImplementation((work: (...args: unknown[]) => unknown, ...args: unknown[]) => {
    if (work.name === 'finishAssemblyWorklet') {
      started.resolve();
      return encoded.promise;
    }
    return work(...args);
  });
  const controller = new AbortController();
  const pending = captureWebp(1, plan, mockPrepareTile, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
  controller.abort();
  encoded.resolve(mockWebpBytes);
  await rejected;
  expect(mockReleaseCapture).toHaveBeenCalledWith('file:///native.png');
  expect(mockFiles.size).toBe(0);
});

test('a decoder failure disposes its data and assembly surface without publishing an image', async () => {
  mockDecode.mockImplementation(() => {
    throw new Error('Decode failed');
  });
  await expect(captureWebp(1, plan, mockPrepareTile, new AbortController().signal)).rejects.toThrow(
    'Decode failed',
  );
  expect(mockDataDispose).toHaveBeenCalledTimes(1);
  expect(mockSurfaceDispose).toHaveBeenCalledTimes(1);
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
