import { captureMemoryPaths } from '../backup';
import { memoryStorage } from '../memoryStorage';

const mockFiles = new Map<string, string>();
const mockState = { failPublication: false, sequence: 0 };
const id = '10000000-0000-4000-8000-000000000001';

jest.mock('expo-crypto', () => ({ randomUUID: () => String(++mockState.sequence) }));
jest.mock('@/backend/data/storage/storagePaths', () => ({
  storageDirectory: () => new (jest.requireMock('expo-file-system').Directory)('file:///store'),
}));
jest.mock('expo-file-system', () => {
  const uri = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(parts);
    }
    create() {}
    list() {
      const names = new Map<string, File | Directory>();
      for (const path of mockFiles.keys()) {
        if (!path.startsWith(this.uri + '/')) continue;
        const remaining = path.slice(this.uri.length + 1);
        const name = remaining.split('/')[0];
        names.set(name, remaining.includes('/') ? new Directory(this, name) : new File(this, name));
      }
      return [...names.values()];
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return [...mockFiles.keys()].some((path) => path.startsWith(this.uri + '/'));
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return new TextEncoder().encode(mockFiles.get(this.uri) ?? '').length;
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get parentDirectory() {
      return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }
    async text() {
      if (!this.exists) throw new Error('Missing file');
      return mockFiles.get(this.uri)!;
    }
    write(content: string | Uint8Array) {
      mockFiles.set(
        this.uri,
        typeof content === 'string' ? content : new TextDecoder().decode(content),
      );
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    async move(destination: File) {
      if (mockState.failPublication && this.uri.endsWith('.pending'))
        throw new Error('Interrupted move');
      if (destination.exists) throw new Error('Destination already exists');
      const content = await this.text();
      mockFiles.delete(this.uri);
      mockFiles.set(destination.uri, content);
      this.uri = destination.uri;
    }
  }
  return { Directory, File };
});

beforeEach(() => {
  mockFiles.clear();
  mockState.failPublication = false;
});

test('keeps published memory when Expo mutates the staged File URI during a move', async () => {
  await memoryStorage.replace(id, 'user', 'First decision');
  await memoryStorage.replace(id, 'user', 'Revised decision');
  expect(await memoryStorage.read(id, 'user')).toBe('Revised decision');
  expect([...mockFiles.keys()]).toEqual([`file:///store/Data/Agents/${id}/USER.md`]);
});

test('recovers the previous revision after interruption and includes it in portable backups', async () => {
  await memoryStorage.replace(id, 'user', 'Keep this decision');
  mockState.failPublication = true;
  await expect(memoryStorage.replace(id, 'user', 'Unpublished decision')).rejects.toThrow();
  expect(await memoryStorage.read(id, 'user')).toBe('Keep this decision');
  const { Directory } = jest.requireMock('expo-file-system');
  expect(captureMemoryPaths(new Directory('file:///store'), [id])).toEqual([
    `agent-memory/${id}/USER.md`,
  ]);
  mockState.failPublication = false;
  await memoryStorage.replace(id, 'user', 'New committed decision');
  expect(await memoryStorage.read(id, 'user')).toBe('New committed decision');
  expect([...mockFiles.keys()]).toEqual([`file:///store/Data/Agents/${id}/USER.md`]);
});
