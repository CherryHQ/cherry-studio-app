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
  expect(mockFiles.get(artifact.file.uri)).toBe('Content\n');
  expect(saveFile).not.toHaveBeenCalled();
  expect(Object.isFrozen(artifact.file)).toBe(true);
  await expect(session.save(artifact)).resolves.toEqual(savedFile);
  const repeated = await session.render({ format: 'markdown' });
  expect(repeated).toBe(artifact);
  await expect(session.save(repeated)).resolves.toEqual(savedFile);
  expect(saveFile).toHaveBeenCalledTimes(1);
  await session.dispose();
  expect(mockFiles.has(artifact.file.uri)).toBe(false);
  expect(mockFiles.get(savedFile.uri)).toBe('Content\n');
  await expect(session.render({ format: 'markdown' })).rejects.toMatchObject({ code: 'disposed' });
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
  expect(mockFiles.has(first.file.uri)).toBe(false);
  expect(mockFiles.get(second.file.uri)).toBe('<main>Content</main>');
  await expect(session.save(first)).rejects.toMatchObject({ code: 'invalid-input' });
  await session.dispose();
  expect(mockFiles.size).toBe(0);
});

test('cancelled capture releases a late native file and never publishes a partial artifact', async () => {
  const started = deferred<void>();
  const native = deferred<{ uri: string; width: number; height: number; release(): void }>();
  const onDisposed = jest.fn();
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    onDisposed,
  );
  const capture = jest.fn(async () => {
    started.resolve();
    return native.promise;
  });
  const rendering = session.render({ format: 'image', presentation, capture });
  const rejected = expect(rendering).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
  await expect(session.render({ format: 'markdown' })).rejects.toMatchObject({ code: 'busy' });
  const disposing = session.dispose();
  expect(onDisposed).not.toHaveBeenCalled();
  mockFiles.set('file:///native.webp', 'image');
  const release = jest.fn(() => {
    mockFiles.delete('file:///native.webp');
  });
  native.resolve({ uri: 'file:///native.webp', width: 360, height: 900, release });
  await rejected;
  await disposing;
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockCopy).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(0);
  expect(onDisposed).toHaveBeenCalledTimes(1);
});

test('capture output is retained until its asynchronous copy completes', async () => {
  const copying = deferred<void>();
  const started = deferred<void>();
  mockCopy.mockImplementationOnce(async (source, destination) => {
    started.resolve();
    await copying.promise;
    mockFiles.set(destination, mockFiles.get(source)!);
  });
  mockFiles.set('file:///native.webp', 'image');
  const release = jest.fn(() => {
    mockFiles.delete('file:///native.webp');
  });
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  const rendering = session.render({
    format: 'image',
    presentation,
    capture: async () => ({ uri: 'file:///native.webp', width: 360, height: 900, release }),
  });
  await started.promise;
  expect(release).not.toHaveBeenCalled();
  copying.resolve();
  const artifact = await rendering;
  expect(artifact.file).toMatchObject({ filename: 'document.webp', mediaType: 'image/webp' });
  expect(mockFiles.get(artifact.file.uri)).toBe('image');
  expect(release).toHaveBeenCalledTimes(1);
  await session.dispose();
});

test.each([
  { width: 360, height: 16384 },
  { width: 16384, height: 360 },
])('rejects WebP dimensions beyond either axis limit: %j', async (dimensions) => {
  const release = jest.fn();
  const session = createDocumentExportSession(
    { kind: 'markdown', source: 'Content' },
    { readManagedImage: jest.fn(), saveFile: jest.fn() },
    () => {},
    () => {},
  );
  await expect(
    session.render({
      format: 'image',
      presentation,
      capture: async () => ({ uri: 'file:///native.webp', ...dimensions, release }),
    }),
  ).rejects.toMatchObject({ code: 'size-limit' });
  expect(mockCopy).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockFiles.size).toBe(0);
  await session.dispose();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
