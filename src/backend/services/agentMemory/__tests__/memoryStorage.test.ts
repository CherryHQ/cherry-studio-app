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
    write(content: string) {
      mockFiles.set(this.uri, content);
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
  await memoryStorage.replace(id, 'fact', 'First decision');
  await memoryStorage.replace(id, 'fact', 'Revised decision');
  expect(await memoryStorage.read(id, 'fact')).toBe('Revised decision');
  expect([...mockFiles.keys()]).toEqual([`file:///store/Data/Agents/${id}/memory/FACT.md`]);
});

test('recovers the previous revision after interruption and includes it in portable backups', async () => {
  await memoryStorage.replace(id, 'fact', 'Keep this decision');
  mockState.failPublication = true;
  await expect(memoryStorage.replace(id, 'fact', 'Unpublished decision')).rejects.toThrow();
  expect(await memoryStorage.read(id, 'fact')).toBe('Keep this decision');
  const { Directory } = jest.requireMock('expo-file-system');
  expect(captureMemoryPaths(new Directory('file:///store'), [id])).toEqual([
    `agent-memory/${id}/memory/FACT.md`,
  ]);
  mockState.failPublication = false;
  await memoryStorage.replace(id, 'fact', 'New committed decision');
  expect(await memoryStorage.read(id, 'fact')).toBe('New committed decision');
  expect([...mockFiles.keys()]).toEqual([`file:///store/Data/Agents/${id}/memory/FACT.md`]);
});
