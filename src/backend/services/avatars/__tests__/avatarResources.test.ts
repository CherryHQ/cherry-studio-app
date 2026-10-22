import { createAvatarResources } from '../avatarResources';

const mockFiles = new Map<string, string>();
let mockStorageRoot = 'file:///documents';
let mockNextId = 0;
let mockFailRecipeWrite = false;

jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockNextId).padStart(12, '0')}`,
}));
jest.mock('@/backend/data/storage/storagePaths', () => ({
  storageDirectory: () => ({ uri: mockStorageRoot }),
}));
jest.mock('expo-file-system', () => {
  const uri = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  return {
    Directory: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = uri(parts);
      }
      create() {}
    },
    File: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = uri(parts);
      }
      get exists() {
        return mockFiles.has(this.uri);
      }
      get size() {
        return mockFiles.get(this.uri)?.length ?? 0;
      }
      create() {
        mockFiles.set(this.uri, '');
      }
      write(value: string) {
        if (mockFailRecipeWrite && this.uri.endsWith('.json')) throw new Error('Disk full');
        mockFiles.set(this.uri, value);
      }
      async text() {
        return mockFiles.get(this.uri)!;
      }
      copy(destination: { uri: string }) {
        if (mockFailRecipeWrite && destination.uri.endsWith('.json')) throw new Error('Disk full');
        mockFiles.set(destination.uri, mockFiles.get(this.uri)!);
      }
      delete() {
        mockFiles.delete(this.uri);
      }
    },
    Paths: { cache: 'file:///cache' },
  };
});

const input = () => ({
  recipe: { character: '00000000-0000-4000-8000-0000000000aa', background: '#ffe1de' },
  png: 'data:image/png;base64,iVBORw0KGgo=',
});
beforeEach(() => {
  mockFiles.clear();
  mockNextId = 0;
  mockFailRecipeWrite = false;
  mockStorageRoot = 'file:///documents';
});

test('saves a portable resource independently of its cache draft, preserving the recipe', async () => {
  const avatars = createAvatarResources();
  const { recipe } = input();
  const draft = await avatars.createDraft(input());
  const saved = await avatars.persist(draft);
  await avatars.remove(draft);
  expect(await avatars.resolve(draft)).toBeNull();
  expect(await avatars.resolve(saved)).toMatchObject({
    recipe,
    coverUri: expect.stringContaining('/documents/avatar-resources/'),
  });
  const metadata = [...mockFiles.entries()].find(([path]) => path.endsWith('.json'));
  expect(JSON.parse(metadata![1])).toEqual({ version: 1, kind: 'character', recipe });
  expect(metadata![1]).not.toContain('file:');
});

test('copying a saved resource gives each owner independent files', async () => {
  const avatars = createAvatarResources();
  const original = await avatars.persist(await avatars.createDraft(input()));
  const copy = await avatars.persist(original);
  expect(copy).not.toBe(original);
  await avatars.remove(original);
  expect(await avatars.resolve(original)).toBeNull();
  expect(await avatars.resolve(copy)).toMatchObject({ recipe: input().recipe });
});

test('resolves files against the current storage root after container relocation', async () => {
  const avatars = createAvatarResources();
  const saved = await avatars.persist(await avatars.createDraft(input()));
  for (const [path, contents] of [...mockFiles]) {
    if (path.startsWith('file:///documents/'))
      mockFiles.set(path.replace('file:///documents/', 'file:///relocated/'), contents);
  }
  mockStorageRoot = 'file:///relocated';
  expect((await avatars.resolve(saved))?.coverUri).toContain('file:///relocated/');
});

test('a failed recipe write compensates the new cover and retains the source', async () => {
  const avatars = createAvatarResources();
  const draft = await avatars.createDraft(input());
  mockFailRecipeWrite = true;
  await expect(avatars.persist(draft)).rejects.toThrow('Disk full');
  expect([...mockFiles.keys()].every((path) => path.startsWith('file:///cache/'))).toBe(true);
  expect(await avatars.resolve(draft)).not.toBeNull();
});

test('an unreadable recipe keeps its cover and is copied verbatim for newer readers', async () => {
  const avatars = createAvatarResources();
  const draft = await avatars.createDraft(input());
  const recipePath = [...mockFiles.keys()].find((path) => path.endsWith('.json'))!;
  const future = JSON.stringify({ version: 2, kind: 'character', recipe: {}, motion: 'new' });
  mockFiles.set(recipePath, future);
  expect(await avatars.resolve(draft)).toEqual({ recipe: null, coverUri: expect.any(String) });
  await avatars.persist(draft);
  expect([...mockFiles.values()].filter((value) => value === future)).toHaveLength(2);
});

test('a missing cover or a path outside the resource directory resolves to null', async () => {
  const avatars = createAvatarResources();
  const draft = await avatars.createDraft(input());
  mockFiles.delete([...mockFiles.keys()].find((path) => path.endsWith('.png'))!);
  expect(await avatars.resolve(draft)).toBeNull();
  expect(await avatars.resolve('avatar-resource:../../private')).toBeNull();
  await expect(avatars.persist(draft)).rejects.toThrow('unavailable');
});
