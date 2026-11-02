import { randomUUID as mockRandomUUID } from 'node:crypto';

import { createMMKV } from 'react-native-mmkv';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';

import {
  parseSshProfileBackup,
  SshProfileService,
  type SshProfileStorage,
} from '../SshProfileService';

jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));
jest.mock('react-native-mmkv', () => ({ createMMKV: jest.fn() }));
let mockStorageId = 'legacy';
let mockRestoring = false;
const mockSnapshots = new Map<string, string>();
jest.mock('@/backend/data/storage/storagePaths', () => ({
  getStorageBoot: () => ({ storageId: mockStorageId, restoring: mockRestoring }),
  storageDirectory: () => ({ uri: `file:///documents/${mockStorageId}` }),
}));
jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() {}
    get exists() {
      return mockSnapshots.has(this.uri);
    }
    get size() {
      return new TextEncoder().encode(this.textSync()).length;
    }
    textSync() {
      return mockSnapshots.get(this.uri)!;
    }
  }
  return { Directory: Entry, File: Entry };
});

const input = () => ({
  revision: mockRandomUUID(),
  name: 'Server',
  host: 'server.local',
  port: 22,
  username: 'user',
  authMethod: 'password' as const,
  remoteDirectory: '/projects',
  fingerprint: 'SHA256:trusted',
  credentialReference: mockRandomUUID(),
});
let values: Map<string, string>;
let storage: SshProfileStorage;
let service: SshProfileService;

beforeEach(() => {
  mockStorageId = 'legacy';
  mockRestoring = false;
  mockSnapshots.clear();
  values = new Map();
  storage = {
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
  };
  service = new SshProfileService(storage);
  jest.mocked(createMMKV).mockReset();
  jest.mocked(createMMKV).mockReturnValue(storage as ReturnType<typeof createMMKV>);
});

test('retains profiles across readers, checks revisions and preserves the saved creation time', async () => {
  const profile = await service.save(input());
  const original = await service.getRow(profile);
  expect(await new SshProfileService(storage).list()).toEqual([profile]);
  const updated = await service.save({ ...input(), name: 'Edited' }, profile);
  expect((await service.getRow(updated)).createdAt).toBe(original.createdAt);
  await expect(service.save(input(), profile)).rejects.toMatchObject({ code: 'changed' });
  await expect(service.remove(profile)).rejects.toMatchObject({ code: 'changed' });
  await service.remove(updated);
  expect(await new SshProfileService(storage).list()).toEqual([]);
});

test('exports configuration without device credential references and rejects secret fields', async () => {
  const saved = input();
  const profile = await service.save(saved);
  const raw = service.exportSnapshot();
  const snapshot = parseSshProfileBackup(raw);
  expect(snapshot.profiles[0]).toMatchObject(profile);
  expect(raw).not.toContain(saved.credentialReference);
  expect(() =>
    parseSshProfileBackup(
      JSON.stringify({
        ...snapshot,
        profiles: [{ ...snapshot.profiles[0], password: 'must-not-be-accepted' }],
      }),
    ),
  ).toThrow();
});

test('rejects corrupt or duplicate persisted records without replacing the saved data', async () => {
  await service.save(input());
  const snapshot = JSON.parse(values.get('profiles')!);
  for (const raw of [
    '{invalid',
    JSON.stringify({ ...snapshot, version: 2 }),
    JSON.stringify({ ...snapshot, profiles: [snapshot.profiles[0], snapshot.profiles[0]] }),
  ]) {
    values.set('profiles', raw);
    await expect(service.list()).rejects.toMatchObject({ code: 'storage' });
    await expect(service.save(input())).rejects.toMatchObject({ code: 'storage' });
    expect(values.get('profiles')).toBe(raw);
  }
});

test('allows backup reads while the storage gate blocks edits and deletion', async () => {
  const profile = await service.save(input());
  const raw = values.get('profiles');
  const release = storageMutationGate.freeze();
  try {
    expect(parseSshProfileBackup(service.exportSnapshot()).profiles).toHaveLength(1);
    await expect(service.save(input(), profile)).rejects.toMatchObject({ code: 'busy' });
    await expect(service.remove(profile)).rejects.toMatchObject({ code: 'busy' });
    expect(values.get('profiles')).toBe(raw);
  } finally {
    release();
  }
});

test('enforces the connection limit without overwriting existing configuration', async () => {
  for (let i = 0; i < 100; i++) await service.save(input());
  const before = values.get('profiles');
  await expect(service.save(input())).rejects.toMatchObject({ code: 'busy' });
  expect(values.get('profiles')).toBe(before);
  const snapshot = parseSshProfileBackup(service.exportSnapshot());
  expect(() =>
    parseSshProfileBackup(
      JSON.stringify({
        ...snapshot,
        profiles: [...snapshot.profiles, { ...snapshot.profiles[0], id: mockRandomUUID() }],
      }),
    ),
  ).toThrow();
});

test('isolates storage generations and restores fresh credential references without replaying the seed', async () => {
  const saved = input();
  const original = await service.save(saved);
  const snapshot = service.exportSnapshot();
  const restoredValues = new Map<string, string>();
  jest.mocked(createMMKV).mockReturnValue({
    getString: (key: string) => restoredValues.get(key),
    set: (key: string, value: string) => {
      restoredValues.set(key, value);
    },
  } as ReturnType<typeof createMMKV>);
  mockStorageId = mockRandomUUID();
  mockRestoring = true;
  mockSnapshots.set(`file:///documents/${mockStorageId}/ssh/profiles.json`, snapshot);
  const restored = new SshProfileService();
  restored.initialize();
  expect(createMMKV).toHaveBeenCalledWith({
    id: `cherry-ssh-profiles-${mockStorageId}`,
    path: `/documents/${mockStorageId}/ssh`,
  });
  const [profile] = await restored.list();
  expect(profile).toMatchObject({ ...original, revision: expect.any(String) });
  expect(profile!.revision).not.toBe(original.revision);
  expect((await restored.getRow(profile!)).credentialReference).not.toBe(saved.credentialReference);
  await restored.remove(profile!);
  // The JSON remains for startup hash verification, but normal boots must not resurrect it.
  mockRestoring = false;
  expect(await new SshProfileService().list()).toEqual([]);
  expect(await service.list()).toEqual([original]);
  expect(mockSnapshots.get(`file:///documents/${mockStorageId}/ssh/profiles.json`)).toBe(snapshot);
});

test('an older backup without SSH metadata starts with an empty generation', async () => {
  mockStorageId = mockRandomUUID();
  mockRestoring = true;
  expect(await new SshProfileService().list()).toEqual([]);
});
