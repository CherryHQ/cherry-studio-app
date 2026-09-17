import type { ExportSignature, ExportWatermark } from '@/shared/contracts/fileExport';
import { FileEntrySchema } from '@/shared/data/types/file';

import { prepareFileExport, prepareImageExport } from '../prepareImageExport';

const mockFiles = new Map<string, Uint8Array>();
const mockResources: { dispose: jest.Mock }[] = [];
const mockBuilderDispose = jest.fn();
let mockHasBuilderDispose = false;
const mockEncodedImage = new Uint8Array([137, 80, 78, 71]);
const mockText = jest.fn();

jest.mock('expo-crypto', () => ({ randomUUID: () => 'signed-image' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(directory: { uri: string }, filename: string) {
      this.uri = `${directory.uri}/${filename}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock('@shopify/react-native-skia', () => ({
  FilterMode: { Linear: 1 },
  FontWeight: { SemiBold: 600, Normal: 400 },
  ImageFormat: { PNG: 0 },
  MipmapMode: { None: 0 },
  TextAlign: { Left: 0, Right: 1 },
  Skia: {
    Color: () => new Float32Array([0, 0, 0, 1]),
    XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    Data: {
      fromURI: async () => mockResource({}),
      fromBase64: () => mockResource({}),
    },
    Image: { MakeImageFromEncoded: () => mockResource({ width: () => 720, height: () => 480 }) },
    Paint: () => mockResource({ setAntiAlias() {}, setColor() {} }),
    ParagraphBuilder: {
      Make: () => ({
        addText(text: string) {
          mockText(text);
          return this;
        },
        build: () => mockResource({ layout() {}, getHeight: () => 20, paint() {} }),
        // Match the native API rather than assuming every SkJSIInstance can be disposed.
        ...(mockHasBuilderDispose ? { dispose: mockBuilderDispose } : {}),
      }),
    },
    Surface: {
      Make: () =>
        mockResource({
          getCanvas: () => ({
            drawImage() {},
            translate() {},
            scale() {},
            drawRect() {},
            drawImageRectOptions() {},
          }),
          flush() {},
          makeImageSnapshot: () => mockResource({ encodeToBytes: () => mockEncodedImage }),
        }),
    },
  },
}));

function mockResource<T extends object>(value: T) {
  const resource = { ...value, dispose: jest.fn() };
  mockResources.push(resource);
  return resource;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockResources.length = 0;
  mockHasBuilderDispose = false;
});

const signature: ExportSignature = {
  background: '#ffffff',
  foreground: '#000000',
  brandName: 'Cherry Studio',
  timestamp: '2026.09.16 18:00',
  logoDataUrl: 'data:image/png;base64,AA==',
};

const watermark: ExportWatermark = { kind: 'cherry', signature };

test.each(['native', 'web'])(
  'prepares an ordinary image for sharing with a %s paragraph builder',
  async (platform) => {
    mockHasBuilderDispose = platform === 'web';
    const uri = 'file:///managed/photo.jpg';
    const original = new Uint8Array([1, 2, 3]);
    mockFiles.set(uri, original);
    const entry = FileEntrySchema.parse({
      id: '00000000-0000-7000-8000-000000000001',
      filename: 'photo.jpg',
      mediaType: 'image/jpeg',
      provenance: 'imported',
      createdAt: 1,
      updatedAt: 1,
      size: original.length,
    });

    const exported = await prepareFileExport({ entry, uri }, watermark);
    expect(exported).toMatchObject({ filename: 'photo.png', mediaType: 'image/png' });
    expect(exported.uri).not.toBe(uri);
    expect(mockFiles.get(exported.uri)).toEqual(mockEncodedImage);
    expect(mockText.mock.calls).toEqual([[signature.brandName], [signature.timestamp]]);
    expect(mockBuilderDispose).toHaveBeenCalledTimes(platform === 'web' ? 2 : 0);
    for (const resource of mockResources) expect(resource.dispose).toHaveBeenCalledTimes(1);
    exported.release();
    expect(mockFiles.has(exported.uri)).toBe(false);
    expect(mockFiles.get(uri)).toEqual(original);
  },
);

test.each(['none', 'cherry'] as const)(
  'a completed document keeps its bytes when delivery requests %s',
  async (style) => {
    const uri = 'file:///managed/conversation.png';
    const entry = FileEntrySchema.parse({
      id: '00000000-0000-7000-8000-000000000001',
      filename: 'conversation.png',
      mediaType: 'image/png',
      provenance: 'document-export',
      createdAt: 1,
      updatedAt: 1,
      size: 1000,
    });
    const original = new Uint8Array([1, 2, 3]);
    mockFiles.set(uri, original);
    const requestedWatermark: ExportWatermark = style === 'none' ? { kind: 'none' } : watermark;
    const photo = await prepareImageExport(
      { uri, provenance: entry.provenance },
      requestedWatermark,
    );
    const shared = await prepareFileExport({ entry, uri }, requestedWatermark);
    expect(photo.uri).toBe(uri);
    expect(shared).toMatchObject({ uri, filename: entry.filename, mediaType: entry.mediaType });
    // Neither operation owns the managed source, so releasing its export cannot remove it.
    photo.release();
    shared.release();
    expect(mockFiles.get(uri)).toBe(original);
    expect(mockResources).toHaveLength(0);
  },
);

test('none preserves the source format and bytes without native image work', async () => {
  const uri = 'file:///managed/photo.jpg';
  const original = new Uint8Array([1, 2, 3]);
  mockFiles.set(uri, original);
  const entry = FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'photo.jpg',
    mediaType: 'image/jpeg',
    provenance: 'imported',
    createdAt: 1,
    updatedAt: 1,
    size: original.length,
  });
  const photo = await prepareImageExport({ uri }, { kind: 'none' });
  const file = await prepareFileExport({ entry, uri }, { kind: 'none' });
  expect(photo.uri).toBe(uri);
  expect(file).toMatchObject({ uri, filename: 'photo.jpg', mediaType: 'image/jpeg' });
  photo.release();
  file.release();
  expect(mockFiles.get(uri)).toBe(original);
  expect(mockResources).toHaveLength(0);
});

test.each(['image/svg+xml', 'IMAGE/SVG+XML', 'image/svg+xml;charset=utf-8'])(
  'SVG delivery preserves the original file with a Cherry watermark requested (%s)',
  async (mediaType) => {
    const uri = 'file:///managed/drawing.svg';
    const original = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    mockFiles.set(uri, original);
    const entry = FileEntrySchema.parse({
      id: '00000000-0000-7000-8000-000000000001',
      filename: 'drawing.svg',
      mediaType,
      provenance: 'imported',
      createdAt: 1,
      updatedAt: 1,
      size: original.length,
    });

    const exported = await prepareFileExport({ entry, uri }, watermark);
    expect(exported).toMatchObject({ uri, filename: entry.filename, mediaType });
    exported.release();
    expect(mockFiles.get(uri)).toBe(original);
    expect(mockResources).toHaveLength(0);
  },
);

test('non-image delivery preserves the original format and filename', async () => {
  const uri = 'file:///managed/report.pdf';
  const entry = FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'report.pdf',
    mediaType: 'application/pdf',
    provenance: 'generated',
    createdAt: 1,
    updatedAt: 1,
    size: 1000,
  });
  expect(await prepareFileExport({ entry, uri }, watermark)).toMatchObject({
    uri,
    filename: entry.filename,
    mediaType: entry.mediaType,
  });
});
