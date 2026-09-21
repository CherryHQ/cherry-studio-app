import { stitchCapturedPngPages } from '../stitchCapturedPngPages';

const mockDirectories = new Set<string>();
const mockFiles = new Map<string, Uint8Array>();
const mockDimensions = new Map<string, { width: number; height: number }>();
const mockDrawImage = jest.fn();
const mockMakeSurface = jest.fn();
const encoded = new Uint8Array([137, 80, 78, 71]);

jest.mock('expo-crypto', () => ({ randomUUID: () => 'capture' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
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
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
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
  mockMakeSurface.mockImplementation(() =>
    mockResource({
      getCanvas: () => ({ drawImage: mockDrawImage }),
      flush() {},
      makeImageSnapshot: () => mockResource({ encodeToBytes: () => encoded }),
    }),
  );
});

test('joins bounded strips into one full-height image and releases its scratch directory', async () => {
  const strips = [
    { uri: 'file:///native/first.png', width: 1080, height: 3600 },
    { uri: 'file:///native/second.png', width: 1080, height: 900 },
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

  expect(result).toMatchObject({ width: 1080, height: 4500 });
  expect(mockMakeSurface).toHaveBeenCalledWith(1080, 4500);
  expect(mockDrawImage.mock.calls.map(([, , top]) => top)).toEqual([0, 3600]);
  expect(mockFiles.get(result.uri)).toEqual(encoded);

  result.release();
  result.release();
  expect(mockDirectories.size).toBe(0);
  expect(mockFiles.has(result.uri)).toBe(false);
  expect(mockFiles.get(strips[0].uri)).toBeDefined();
});

function mockResource<T extends object>(value: T) {
  return { ...value, dispose: jest.fn() };
}
