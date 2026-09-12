import type { CatalogManifest } from '@cherrystudio/provider-registry/mobile';

import {
  readProviderRegistrySnapshots,
  writeProviderRegistrySnapshot,
} from '../providerRegistrySnapshot';

jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const state = { files, failMove: false };
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
    write(body: string) {
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
      if (state.failMove) throw new Error('Move interrupted');
      files.set(destination.uri, await this.text());
      files.delete(this.uri);
    }
  }
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: '/cache', document: '/documents' },
    testState: state,
  };
});

const { testState } = jest.requireMock<{
  testState: { files: Map<string, string>; failMove: boolean };
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

it('reads legacy downloads independently of the old app bundle version', async () => {
  testState.files.set(
    '/cache/provider-registry-v2/snapshot.json',
    JSON.stringify({
      bundledVersions: { models: 'old', providerModels: 'old' },
      manifest: manifest(1),
    }),
  );
  testState.files.set('/cache/provider-registry-v2/models.json', files['models.json']);
  testState.files.set(
    '/cache/provider-registry-v2/provider-models.json',
    files['provider-models.json'],
  );
  const [snapshot] = await readProviderRegistrySnapshots();
  expect(snapshot).toEqual({ files, manifest: manifest(1), slot: 'legacy' });
  await writeProviderRegistrySnapshot(snapshot.files, snapshot.manifest, snapshot.slot);
  for (const path of [...testState.files.keys()]) {
    if (path.startsWith('/cache/')) testState.files.delete(path);
  }
  expect(await readProviderRegistrySnapshots()).toEqual([
    { files, manifest: manifest(1), slot: 'a' },
  ]);
});
