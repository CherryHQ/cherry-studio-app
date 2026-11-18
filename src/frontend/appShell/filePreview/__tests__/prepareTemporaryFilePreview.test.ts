import { prepareTemporaryFilePreview } from '../prepareTemporaryFilePreview';

const mockFiles = new Map<string, Uint8Array>();
let mockCopyGate: Promise<void> | undefined;
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('expo-file-system', () => {
  class Location {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/, ''))
        .join('/');
    }
  }
  class Directory extends Location {
    create() {}
    delete() {
      for (const key of mockFiles.keys()) if (key.startsWith(this.uri + '/')) mockFiles.delete(key);
    }
  }
  class File extends Location {
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    async copy(destination: File) {
      await mockCopyGate;
      const bytes = mockFiles.get(this.uri);
      if (!bytes) throw new Error('Source unavailable');
      mockFiles.set(destination.uri, bytes.slice());
    }
  }
  return { File, Directory, Paths: { cache: 'file:///cache' } };
});

beforeEach(() => {
  mockFiles.clear();
  mockCopyGate = undefined;
});
const source = { uri: 'file:///remote/photo.png', filename: '图片.png', mediaType: 'image/png' };

test('preview bytes survive source retirement and are released by their own lease', async () => {
  const bytes = Uint8Array.from([0, 255, 128, 65]);
  mockFiles.set(source.uri, bytes);
  const preview = await prepareTemporaryFilePreview(source, new AbortController().signal);
  mockFiles.delete(source.uri);
  expect(mockFiles.get(preview.uri)).toEqual(bytes);
  expect(preview.entry).toMatchObject({
    filename: source.filename,
    size: bytes.length,
    mediaType: 'image/png',
  });
  expect(preview.uri).not.toContain(source.filename);
  preview.release();
  expect(mockFiles.size).toBe(0);
});

test('closing during a physical copy removes late bytes and never publishes a preview', async () => {
  let finish!: () => void;
  mockCopyGate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mockFiles.set(source.uri, Uint8Array.from([1, 2, 3]));
  const controller = new AbortController();
  const pending = prepareTemporaryFilePreview(source, controller.signal);
  controller.abort();
  finish();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect([...mockFiles.keys()]).toEqual([source.uri]);
});
