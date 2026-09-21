import { stitchCapturedPngPages } from '../stitchCapturedPngPages';

const mockDirectories = new Set<string>();
const mockFiles = new Map<string, Uint8Array>();
const mockDimensions = new Map<string, { width: number; height: number }>();
const mockDrawImage = jest.fn();
const mockMakeSurface = jest.fn();
const mockRunOnRuntimeAsync = jest.fn();
const mockSurfaceDispose = jest.fn();
const encoded = new Uint8Array([137, 80, 78, 71]);

jest.mock('react-native-worklets', () => ({
  createWorkletRuntime: () => ({}),
  runOnRuntimeAsync: (...args: unknown[]) => mockRunOnRuntimeAsync(...args),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'capture' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  FileMode: { WriteOnly: 'write' },
  Directory: class {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return mockDirectories.has(this.uri);
    }
    create() {
      mockDirectories.add(this.uri);
    }
    delete() {
      mockDirectories.delete(this.uri);
      for (const uri of mockFiles.keys()) {
        if (uri.startsWith(`${this.uri}/`)) mockFiles.delete(uri);
      }
    }
  },
  File: class {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    async copy(destination: { uri: string }) {
      mockFiles.set(destination.uri, mockFiles.get(this.uri)!);
      const dimensions = mockDimensions.get(this.uri);
      if (dimensions) mockDimensions.set(destination.uri, dimensions);
    }
    create() {
      mockFiles.set(this.uri, new Uint8Array());
    }
    open() {
      return {
        writeBytes: (bytes: Uint8Array) => {
          const previous = mockFiles.get(this.uri)!;
          mockFiles.set(this.uri, new Uint8Array([...previous, ...bytes]));
        },
        close() {},
      };
    }
  },
}));
jest.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { PNG: 0 },
  Skia: {
    Data: {
      fromURI: async (uri: string) => mockResource({ uri }),
    },
    Image: {
      MakeImageFromEncoded: (data: { uri: string }) => {
        const dimensions = mockDimensions.get(data.uri);
        return dimensions
          ? mockResource({ width: () => dimensions.width, height: () => dimensions.height })
          : null;
      },
    },
    Surface: {
      Make: (...dimensions: number[]) => mockMakeSurface(...dimensions),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDirectories.clear();
  mockFiles.clear();
  mockDimensions.clear();
  mockRunOnRuntimeAsync.mockImplementation(async (_runtime, worklet, ...args) => worklet(...args));
  mockMakeSurface.mockImplementation(() => ({
    dispose: mockSurfaceDispose,
    getCanvas: () => ({ drawImage: mockDrawImage }),
    flush() {},
    makeImageSnapshot: () => mockResource({ encodeToBytes: () => encoded }),
  }));
});

test('joins tiles at their original pixel coordinates and releases its scratch directory', async () => {
  const strips = [
    { uri: 'file:///native/first.png', width: 900, height: 1200, left: 0, top: 0 },
    { uri: 'file:///native/second.png', width: 180, height: 1200, left: 900, top: 0 },
    { uri: 'file:///native/third.png', width: 900, height: 300, left: 0, top: 1200 },
    { uri: 'file:///native/fourth.png', width: 180, height: 300, left: 900, top: 1200 },
  ];
  for (const strip of strips) {
    mockFiles.set(strip.uri, new Uint8Array([strip.height]));
    mockDimensions.set(strip.uri, strip);
  }

  const result = await stitchCapturedPngPages(async (onPage) => {
    const signal = new AbortController().signal;
    for (const [index, strip] of strips.entries()) {
      await onPage({ ...strip, release() {} }, index, strips.length, signal);
    }
  }, new AbortController().signal);

  expect(result).toMatchObject({ width: 1080, height: 1500 });
  expect(mockMakeSurface).toHaveBeenCalledWith(1080, 1500);
  expect(mockDrawImage.mock.calls.map(([, left, top]) => [left, top])).toEqual([
    [0, 0],
    [900, 0],
    [0, 1200],
    [900, 1200],
  ]);
  expect(mockFiles.get(result.uri)).toEqual(encoded);

  result.release();
  result.release();
  expect(mockDirectories.size).toBe(0);
  expect(mockFiles.has(result.uri)).toBe(false);
  expect(mockFiles.get(strips[0].uri)).toBeDefined();
});

test.each(['cancel', 'failure'] as const)(
  'waits for the encoder before releasing native pixels on %s',
  async (outcome) => {
    const controller = new AbortController();
    let startEncoding!: () => void;
    const encoding = new Promise<void>((resolve) => {
      startEncoding = resolve;
    });
    let finishEncoding!: () => void;
    const worker = new Promise<void>((resolve) => {
      finishEncoding = resolve;
    });
    mockRunOnRuntimeAsync.mockImplementation(async (_runtime, worklet, ...args) => {
      if (args.length === 2) {
        startEncoding();
        await worker;
        if (outcome === 'failure') throw new Error('PNG encoder failed');
      }
      return worklet(...args);
    });
    const tile = { uri: 'file:///native/tile.png', width: 900, height: 1200, left: 0, top: 0 };
    mockFiles.set(tile.uri, encoded);
    mockDimensions.set(tile.uri, tile);
    const result = stitchCapturedPngPages(async (onPage) => {
      await onPage({ ...tile, release() {} }, 0, 1, controller.signal);
    }, controller.signal).catch((error: unknown) => error);
    await encoding;
    if (outcome === 'cancel') controller.abort();
    expect(mockSurfaceDispose).not.toHaveBeenCalled();
    expect(mockDirectories.size).toBe(1);
    finishEncoding();
    expect(await result).toMatchObject(
      outcome === 'cancel' ? { name: 'AbortError' } : { code: 'capture-failed' },
    );
    expect(mockSurfaceDispose).toHaveBeenCalledTimes(1);
    expect(mockDirectories.size).toBe(0);
    expect([...mockFiles.keys()]).toEqual([tile.uri]);
  },
);

function mockResource<T extends object>(value: T) {
  return { ...value, dispose: jest.fn() };
}
