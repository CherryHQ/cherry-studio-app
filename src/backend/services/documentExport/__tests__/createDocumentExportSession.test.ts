import type { CaptureExportHtml } from '@/shared/contracts/documentExport';
import type { ExportWatermark } from '@/shared/contracts/fileExport';
import { FileEntrySchema } from '@/shared/data/types/file';

import { createDocumentExportSession } from '../createDocumentExportSession';

const mockFiles = new Map<string, string>();
const mockDirectories = new Set<string>();
let mockNextId = 0;
const mockCopy = jest.fn(async (source: string, destination: string) => {
  const contents = mockFiles.get(source);
  if (contents === undefined) throw new Error('Missing source');
  mockFiles.set(destination, contents);
});

jest.mock('expo-crypto', () => ({ randomUUID: () => `export-${++mockNextId}` }));
jest.mock('expo-file-system', () => {
  const uri = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(parts);
    }
    create() {
      mockDirectories.add(this.uri);
    }
    get exists() {
      return (
        mockDirectories.has(this.uri) ||
        [...mockFiles.keys()].some((path) => path.startsWith(`${this.uri}/`))
      );
    }
    delete() {
      for (const path of mockFiles.keys())
        if (path.startsWith(`${this.uri}/`)) mockFiles.delete(path);
      for (const path of mockDirectories)
        if (path === this.uri || path.startsWith(`${this.uri}/`)) mockDirectories.delete(path);
    }
  }
  return {
    Directory,
    File: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = uri(parts);
      }
      get parentDirectory() {
        return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/')));
      }
      get exists() {
        return mockFiles.has(this.uri);
      }
      write(text: string) {
        mockFiles.set(this.uri, text);
      }
      copy(destination: { uri: string }) {
        return mockCopy(this.uri, destination.uri);
      }
    },
    Paths: { cache: 'file:///cache' },
  };
});
jest.mock('../renderHtml', () => ({
  renderHtml: async () => ({ html: '<main>Content</main>', issues: [] }),
}));

const presentation = {
  width: 360,
  typography: {
    base: { fontSize: 16, lineHeight: 24 },
    sm: { fontSize: 14, lineHeight: 20 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 26 },
  },
  colors: {
    background: '#ffffff',
    foreground: '#111111',
    muted: '#666666',
    border: '#cccccc',
    link: '#006600',
    tertiary: '#666666',
    subtleBorder: '#eeeeee',
    bubble: '#f0f0f0',
    secondary: '#f5f5f5',
    codeBlock: '#f5f5f5',
    inlineCode: '#eeeeee',
    inlineCodeForeground: '#111111',
  },
};
const savedFile = {
  entry: FileEntrySchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    filename: 'document.md',
    mediaType: 'text/markdown',
    provenance: 'document-export',
    size: 7,
    createdAt: 1,
    updatedAt: 1,
  }),
  uri: 'file:///permanent/document.md',
};

beforeEach(() => {
  mockFiles.clear();
  mockDirectories.clear();
  mockCopy.mockClear();
});

test('Markdown preview stays in memory and repeated sharing reuses its persistent file', async () => {
  const saveFile = jest.fn(async (file: { uri: string }) => {
    mockFiles.set(savedFile.uri, mockFiles.get(file.uri)!);
    return savedFile;
  });
  const readManagedImage = jest.fn();
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage, saveFile },
    () => {},
    () => {},
  );
  expect(session.markdown).toBe('Content\n');
  expect(mockFiles.size).toBe(0);
  expect(mockDirectories.size).toBe(0);
  expect(readManagedImage).not.toHaveBeenCalled();
  const artifact = await session.render({ format: 'markdown' });
  if (artifact.format !== 'markdown') throw new Error('Expected Markdown');
  expect(mockFiles.get(artifact.file.uri)).toBe('Content\n');
  expect(saveFile).not.toHaveBeenCalled();
  expect(Object.isFrozen(artifact.file)).toBe(true);
  await expect(session.save(artifact)).resolves.toEqual([savedFile]);
  const repeated = await session.render({ format: 'markdown' });
  expect(repeated).toBe(artifact);
  await expect(session.save(repeated)).resolves.toEqual([savedFile]);
  expect(saveFile).toHaveBeenCalledTimes(1);
  await session.dispose();
  expect(mockFiles.has(artifact.file.uri)).toBe(false);
  expect(mockFiles.get(savedFile.uri)).toBe('Content\n');
  await expect(session.render({ format: 'markdown' })).rejects.toMatchObject({ code: 'disposed' });
});

test('Markdown materialization preserves the signature and reuses only matching signed text', async () => {
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  const watermark: ExportWatermark = {
    kind: 'cherry',
    signature: {
      brandName: 'Cherry Studio',
      timestamp: '2026/09/15 12:00',
      background: '#ffffff',
      foreground: '#000000',
      logoDataUrl: 'data:image/png;base64,AA==',
    },
  };
  const first = await session.render({ format: 'markdown', watermark });
  if (first.format !== 'markdown') throw new Error('Expected Markdown');
  expect(first.text).toBe('Content\n\n---\n\n**Cherry Studio** · 2026/09/15 12:00\n');
  expect(mockFiles.get(first.file.uri)).toBe(first.text);
  expect(session.markdown).toBe('Content\n');
  await expect(session.render({ format: 'markdown', watermark })).resolves.toBe(first);
  const second = await session.render({
    format: 'markdown',
    watermark: {
      kind: 'cherry',
      signature: { ...watermark.signature, timestamp: '2026/09/15 12:01' },
    },
  });
  if (second.format !== 'markdown') throw new Error('Expected Markdown');
  expect(second.text).toContain('2026/09/15 12:01');
  expect(mockFiles.get(second.file.uri)).toBe(second.text);
  expect(mockFiles.has(first.file.uri)).toBe(false);
  await session.dispose();
});

test('replacing a preview discards its file and rejects stale publication requests', async () => {
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  const first = await session.render({ format: 'markdown' });
  const second = await session.render({ format: 'html', presentation });
  if (first.format !== 'markdown' || second.format !== 'html')
    throw new Error('Expected text artifacts');
  expect(mockFiles.has(first.file.uri)).toBe(false);
  expect(mockFiles.get(second.file.uri)).toBe('<main>Content</main>');
  await expect(session.save(first)).rejects.toMatchObject({ code: 'invalid-input' });
  await session.dispose();
  expect(mockFiles.size).toBe(0);
});

test('switching Markdown to none replaces the branded output with a plain file', async () => {
  const saveFile = jest.fn(async () => savedFile);
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile },
    () => {},
    () => {},
  );
  const watermark: ExportWatermark = {
    kind: 'cherry',
    signature: {
      brandName: 'Cherry Studio',
      timestamp: '2026.09.17 12:00',
      background: '#ffffff',
      foreground: '#000000',
      logoDataUrl: 'data:image/png;base64,AA==',
    },
  };
  const branded = await session.render({ format: 'markdown', watermark });
  if (branded.format !== 'markdown') throw new Error('Expected Markdown');
  expect(mockFiles.get(branded.file.uri)).toContain('Cherry Studio');
  const plain = await session.render({ format: 'markdown', watermark: { kind: 'none' } });
  if (plain.format !== 'markdown') throw new Error('Expected Markdown');
  expect(plain.id).not.toBe(branded.id);
  expect(mockFiles.get(plain.file.uri)).toBe('Content\n');
  await session.save(plain);
  expect(saveFile).toHaveBeenCalledWith(plain.file, expect.any(AbortSignal));
  await session.dispose();
});

test('cancelled capture waits for its in-flight delivery and never publishes partial pages', async () => {
  const started = deferred<void>();
  const native = deferred<void>();
  const onDisposed = jest.fn();
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    onDisposed,
  );
  const capture: CaptureExportHtml = async ({ onPage }) => {
    started.resolve();
    await native.promise;
    await onPage({ uri: 'file:///native.png', width: 1080, height: 3744, index: 0, total: 1 });
  };
  const rendering = session.render({ format: 'image', layout: 'pages', presentation, capture });
  const rejected = expect(rendering).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
  await expect(session.render({ format: 'markdown' })).rejects.toMatchObject({ code: 'busy' });
  const disposing = session.dispose();
  expect(onDisposed).not.toHaveBeenCalled();
  native.resolve();
  await rejected;
  await disposing;
  expect(mockCopy).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(0);
  expect(onDisposed).toHaveBeenCalledTimes(1);
});

test('page delivery awaits its file copy before the capture surface can release it', async () => {
  const copying = deferred<void>();
  const started = deferred<void>();
  mockCopy.mockImplementationOnce(async (source, destination) => {
    started.resolve();
    await copying.promise;
    mockFiles.set(destination, mockFiles.get(source)!);
  });
  mockFiles.set('file:///native.png', 'original pixels');
  const release = jest.fn(() => mockFiles.delete('file:///native.png'));
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  const rendering = session.render({
    format: 'image',
    layout: 'pages',
    presentation,
    capture: async ({ onPage }) => {
      try {
        await onPage({ uri: 'file:///native.png', width: 1080, height: 3744, index: 0, total: 1 });
      } finally {
        release();
      }
    },
  });
  await started.promise;
  expect(release).not.toHaveBeenCalled();
  copying.resolve();
  const artifact = await rendering;
  if (artifact.format !== 'image') throw new Error('Expected image');
  expect(artifact.pages[0].file).toMatchObject({
    filename: 'document.png',
    mediaType: 'image/png',
  });
  expect(mockFiles.get(artifact.pages[0].file.uri)).toBe('original pixels');
  expect(release).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(artifact.pages)).toBe(true);
  expect(Object.isFrozen(artifact.pages[0].file)).toBe(true);
  await session.dispose();
});

test('all pages retain their original bytes and receive sortable, ordered filenames', async () => {
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content', title: 'Conversation' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  const artifact = await session.render({
    format: 'image',
    layout: 'pages',
    presentation,
    capture: async ({ onPage }) => {
      for (let index = 0; index < 12; index++) {
        const uri = `file:///native-${index}.png`;
        mockFiles.set(uri, `pixels ${index}`);
        await onPage({ uri, width: 1080, height: 3600, index, total: 12 });
        mockFiles.delete(uri);
      }
    },
  });
  if (artifact.format !== 'image') throw new Error('Expected image');
  expect(artifact.pages.map((page) => page.file.filename)).toEqual(
    Array.from(
      { length: 12 },
      (_, index) => `Conversation-${String(index + 1).padStart(3, '0')}.png`,
    ),
  );
  expect(artifact.pages.map((page) => mockFiles.get(page.file.uri))).toEqual(
    Array.from({ length: 12 }, (_, index) => `pixels ${index}`),
  );
  await session.dispose();
  expect(mockFiles.size).toBe(0);
});

test('a failed page leaves the previous artifact usable and cleans the incomplete output', async () => {
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  const previous = await session.render({ format: 'markdown' });
  if (previous.format !== 'markdown') throw new Error('Expected Markdown');
  mockFiles.set('file:///native.png', 'pixels');
  await expect(
    session.render({
      format: 'image',
      layout: 'pages',
      presentation,
      capture: async ({ onPage }) => {
        await onPage({ uri: 'file:///native.png', width: 1080, height: 3600, index: 0, total: 2 });
        throw new Error('Second page failed');
      },
    }),
  ).rejects.toThrow();
  expect([...mockFiles.keys()].filter((uri) => uri.startsWith('file:///cache'))).toEqual([
    previous.file.uri,
  ]);
  await session.dispose();
});

test('retrying a partly saved batch reuses committed pages without duplicating file-library entries', async () => {
  let attempt = 0;
  const saveFile = jest.fn(async (file: { uri: string; filename: string }) => {
    attempt++;
    if (attempt === 2) throw new Error('Storage unavailable');
    const result = { ...savedFile, uri: `file:///permanent/${file.filename}` };
    mockFiles.set(result.uri, mockFiles.get(file.uri)!);
    return result;
  });
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile },
    () => {},
    () => {},
  );
  mockFiles.set('file:///native.png', 'pixels');
  const artifact = await session.render({
    format: 'image',
    layout: 'pages',
    presentation,
    capture: async ({ onPage }) => {
      for (let index = 0; index < 3; index++)
        await onPage({ uri: 'file:///native.png', width: 1080, height: 3600, index, total: 3 });
    },
  });
  await expect(session.save(artifact)).rejects.toThrow('Storage unavailable');
  const files = await session.save(artifact);
  expect(files.map((file) => file.uri)).toEqual([
    'file:///permanent/document-001.png',
    'file:///permanent/document-002.png',
    'file:///permanent/document-003.png',
  ]);
  expect(saveFile.mock.calls.map(([file]) => file.filename)).toEqual([
    'document-001.png',
    'document-002.png',
    'document-002.png',
    'document-003.png',
  ]);
  await session.save(artifact);
  expect(saveFile).toHaveBeenCalledTimes(4);
  await session.dispose();
  expect(files.every((file) => mockFiles.has(file.uri))).toBe(true);
});

test.each([
  { width: 360, height: 0, index: 0, total: 1 },
  { width: -1, height: 900, index: 0, total: 1 },
  { width: 360, height: Infinity, index: 0, total: 1 },
  { width: 360.5, height: 900, index: 0, total: 1 },
  { width: 360, height: 900, index: 1, total: 2 },
  { width: 360, height: 900, index: 0, total: 0 },
])('rejects invalid page delivery: %j', async (dimensions) => {
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  await expect(
    session.render({
      format: 'image',
      layout: 'pages',
      presentation,
      capture: async ({ onPage }) => onPage({ uri: 'file:///native.png', ...dimensions }),
    }),
  ).rejects.toMatchObject({ code: 'capture-failed' });
  expect(mockCopy).not.toHaveBeenCalled();
  await session.dispose();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
