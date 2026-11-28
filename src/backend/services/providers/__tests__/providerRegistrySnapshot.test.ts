import {
  type CatalogManifest,
  type MobileRemoteRegistrySnapshot,
  PARSED_REGISTRY_CACHE_VERSION,
  REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
} from '@/backend/data/services/MobileRegistryLoader';

import {
  readActiveProviderRegistrySlot,
  readParsedProviderRegistryCache,
  readProviderRegistrySnapshots,
  readProviderRegistrySnapshotSlot,
  writeParsedProviderRegistryCache,
  writeProviderRegistrySnapshot,
} from '../providerRegistrySnapshot';

jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const state = { files, failMove: false, failMoveNames: new Set<string>() };
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/, '')).join('/');
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    create() {}
  }
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get parentDirectory() {
      return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }
    create() {
      files.set(this.uri, '');
    }
    delete() {
      files.delete(this.uri);
    }
    writeSync(body: string) {
      files.set(this.uri, body);
    }
    async text() {
      const body = files.get(this.uri);
      if (body === undefined) throw new Error('File not found');
      return body;
    }
    async move(destination: MockFile) {
      // Expo's iOS overwrite removes the destination before moving the source.
      files.delete(destination.uri);
      if (state.failMove || state.failMoveNames.has(destination.name)) {
        throw new Error('Move interrupted');
      }
      files.set(destination.uri, await this.text());
      files.delete(this.uri);
    }
  }
  return {
    File: MockFile,
    Paths: { document: '/documents' },
    testState: state,
  };
});

const { testState } = jest.requireMock<{
  testState: { files: Map<string, string>; failMove: boolean; failMoveNames: Set<string> };
}>('expo-file-system');
const files = {
  'models.json': '{"version":"models","models":[]}',
  'provider-models.json': '{"version":"providers","overrides":[]}',
};
function manifest(revision: number): CatalogManifest {
  return {
    files: { 'models.json': 'models', 'provider-models.json': 'providers' },
    minAppVersion: '2.0.8',
    sourceAppVersion: '2.0.8',
    schemaVersion: 1,
    revision,
  };
}

beforeEach(() => {
  testState.files.clear();
  testState.failMove = false;
  testState.failMoveNames.clear();
});

it('keeps the previous complete snapshot when an overwrite is interrupted', async () => {
  const first = await writeProviderRegistrySnapshot(files, manifest(1));
  const second = await writeProviderRegistrySnapshot(files, manifest(2), first);
  testState.failMove = true;
  await expect(writeProviderRegistrySnapshot(files, manifest(3), second)).rejects.toThrow(
    'Move interrupted',
  );
  expect(
    (await readProviderRegistrySnapshots()).map((snapshot) => snapshot.manifest.revision),
  ).toEqual([2]);
  expect(testState.files.has('/documents/provider-registry/snapshot-b.json')).toBe(true);
});

it('reads the previous slot when the newer slot is truncated', async () => {
  const first = await writeProviderRegistrySnapshot(files, manifest(1));
  await writeProviderRegistrySnapshot(files, manifest(2), first);
  testState.files.set('/documents/provider-registry/snapshot-b.json', '{');
  expect(await readProviderRegistrySnapshots()).toEqual([
    { files, manifest: manifest(1), slot: 'a' },
  ]);
});

it('persists active slot pointer and parsed cache alongside the durable snapshot', async () => {
  const parsedSnapshot = {
    models: { models: [], version: 'models' },
    providerModels: { overrides: [], version: 'providers' },
  } as unknown as MobileRemoteRegistrySnapshot;

  const slot = await writeProviderRegistrySnapshot(files, manifest(3), undefined, parsedSnapshot);

  expect(slot).toBe('a');
  expect(await readActiveProviderRegistrySlot()).toEqual({
    revision: 3,
    schemaVersion: 1,
    slot: 'a',
  });
  expect(await readParsedProviderRegistryCache('a')).toEqual({
    cacheVersion: PARSED_REGISTRY_CACHE_VERSION,
    desktopCompatibilityVersion: REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
    manifest: manifest(3),
    slot: 'a',
    snapshot: parsedSnapshot,
  });
  expect(await readProviderRegistrySnapshotSlot('a')).toEqual({
    files,
    manifest: manifest(3),
    slot: 'a',
  });

  // Corrupted parsed cache returns null cleanly without throwing.
  testState.files.set('/documents/provider-registry/parsed-a.json', '{bad');
  expect(await readParsedProviderRegistryCache('a')).toBeNull();

  await writeParsedProviderRegistryCache('b', manifest(4), parsedSnapshot);
  expect(await readActiveProviderRegistrySlot()).toEqual({
    revision: 4,
    schemaVersion: 1,
    slot: 'b',
  });
});

it('advances the pointer without leaving stale parsed cache when parsed cache write fails', async () => {
  const parsedSnapshot = {
    models: { models: [], version: 'models' },
    providerModels: { overrides: [], version: 'providers' },
  } as unknown as MobileRemoteRegistrySnapshot;
  const first = await writeProviderRegistrySnapshot(files, manifest(1), undefined, parsedSnapshot);

  testState.failMoveNames.add('parsed-b.json');
  const second = await writeProviderRegistrySnapshot(files, manifest(2), first, parsedSnapshot);

  expect(second).toBe('b');
  expect(await readParsedProviderRegistryCache('b')).toBeNull();
  expect(await readActiveProviderRegistrySlot()).toEqual({
    revision: 2,
    schemaVersion: 1,
    slot: 'b',
  });
});

it('clears the old active pointer before committing so pointer failure triggers full scan', async () => {
  const first = await writeProviderRegistrySnapshot(files, manifest(1));

  testState.failMoveNames.add('active-slot.json');
  const second = await writeProviderRegistrySnapshot(files, manifest(2), first);

  expect(second).toBe('b');
  expect(await readActiveProviderRegistrySlot()).toBeNull();
  expect(
    (await readProviderRegistrySnapshots()).map((snapshot) => snapshot.manifest.revision),
  ).toEqual([2, 1]);
});
