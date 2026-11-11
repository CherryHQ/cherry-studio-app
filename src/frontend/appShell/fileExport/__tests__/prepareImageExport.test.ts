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
    writeSync(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock('@shopify/react-native-skia', () => ({
  FilterMode: { Linear: 1, Nearest: 0 },
  FontWeight: { SemiBold: 600, Normal: 400 },
  ImageFormat: { PNG: 0 },
  MipmapMode: { None: 0 },
  TextAlign: { Left: 0 },
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
  brandColor: '#ff5757',
  downloadLabel: 'Scan to download the mobile app',
  downloadLinkLabel: 'Download the mobile app',
  downloadUrl: 'https://example.com/mobile',
  qrCodeDataUrl: 'data:image/png;base64,AQ==',
  logoDataUrl: 'data:image/png;base64,AA==',
};

const watermark: ExportWatermark = { kind: 'cherry', signature };

test('discards a branded AI derivative if its metadata cannot be restored, retaining the original', async () => {
  const uri = 'file:///managed/ai.jpg';
  const original = new Uint8Array([1, 2, 3]);
  mockFiles.set(uri, original);
  const entry = FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'ai.jpg',
    mediaType: 'image/jpeg',
    provenance: 'generated',
    size: original.length,
    createdAt: 1,
    updatedAt: 1,
  });
  await expect(
    prepareFileExport({ entry, uri }, watermark, async () => {
      throw new Error('Metadata write failed');
    }),
  ).rejects.toThrow('Metadata write failed');
  expect([...mockFiles.keys()]).toEqual([uri]);
  expect(mockFiles.get(uri)).toEqual(original);
});

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
    expect(mockText.mock.calls).toEqual([[signature.brandName], [signature.downloadLabel]]);
    expect(mockBuilderDispose).toHaveBeenCalledTimes(platform === 'web' ? 2 : 0);
    for (const resource of mockResources) expect(resource.dispose).toHaveBeenCalledTimes(1);
    exported.release();
    expect(mockFiles.has(exported.uri)).toBe(false);
    expect(mockFiles.get(uri)).toEqual(original);
  },
);

test.each(['none', 'cherry'] as const)(
  'a saved document image follows the sharing watermark setting (%s)',
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
    const photo = await prepareImageExport({ uri }, requestedWatermark);
    const shared = await prepareFileExport({ entry, uri }, requestedWatermark);
    if (style === 'none') {
      expect(photo.uri).toBe(uri);
      expect(shared).toMatchObject({ uri, filename: entry.filename, mediaType: entry.mediaType });
      expect(mockResources).toHaveLength(0);
    } else {
      expect(photo.uri).not.toBe(uri);
      expect(shared.uri).not.toBe(uri);
      expect(mockFiles.get(shared.uri)).toEqual(mockEncodedImage);
      expect(mockText.mock.calls).toEqual([
        [signature.brandName],
        [signature.downloadLabel],
        [signature.brandName],
        [signature.downloadLabel],
      ]);
    }
    // Neither operation owns the managed source, so releasing its export cannot remove it.
    photo.release();
    shared.release();
    expect(mockFiles.get(uri)).toBe(original);
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

test.each(['image/gif', 'IMAGE/GIF', 'image/gif;charset=binary'])(
  'GIF saving and sharing preserve the original with a watermark selected (%s)',
  async (mediaType) => {
    // The media type remains authoritative even when the URI has no GIF suffix.
    const uri = 'file:///managed/animation';
    const original = new Uint8Array([71, 73, 70, 56, 57, 97]);
    mockFiles.set(uri, original);
    const entry = FileEntrySchema.parse({
      id: '00000000-0000-7000-8000-000000000001',
      filename: 'animation.gif',
      mediaType,
      provenance: 'generated',
      createdAt: 1,
      updatedAt: 1,
      size: original.length,
    });

    const photo = await prepareImageExport({ uri, mediaType }, watermark);
    const shared = await prepareFileExport({ entry, uri }, watermark);
    expect(photo.uri).toBe(uri);
    expect(shared).toMatchObject({ uri, filename: 'animation.gif', mediaType });
    photo.release();
    shared.release();
    expect(mockFiles.get(uri)).toBe(original);
    expect(mockFiles.size).toBe(1);
    expect(mockResources).toHaveLength(0);
  },
);

test.each(['image/gif; charset=binary', ' IMAGE/GIF ; charset=binary '])(
  'GIF photo exports normalize media types with whitespace (%s)',
  async (mediaType) => {
    const uri = 'file:///managed/animation';
    const original = new Uint8Array([71, 73, 70, 56, 57, 97]);
    mockFiles.set(uri, original);

    const photo = await prepareImageExport({ uri, mediaType }, watermark);
    expect(photo.uri).toBe(uri);
    photo.release();
    expect(mockFiles.get(uri)).toBe(original);
    expect(mockFiles.size).toBe(1);
    expect(mockResources).toHaveLength(0);
  },
);

test.each([
  'file:///managed/animation.GIF',
  'file:///managed/animation.gif?revision=1',
  'file:///managed/animation.gif#preview',
])('URI-only GIF saving preserves the original with a watermark selected (%s)', async (uri) => {
  const original = new Uint8Array([71, 73, 70, 56, 57, 97]);
  mockFiles.set(uri, original);

  const photo = await prepareImageExport({ uri }, watermark);
  expect(photo.uri).toBe(uri);
  photo.release();
  expect(mockFiles.get(uri)).toBe(original);
  expect(mockFiles.size).toBe(1);
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
