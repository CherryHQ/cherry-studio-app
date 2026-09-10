import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { PluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';

import { PluginCredentialStore } from '../PluginCredentialStore';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));

let db: TestDb;
let database: PluginAuthorizationService;
let storage: PluginCredentialStore;
let secrets: Map<string, string>;
const native = {
  getItemAsync: jest.fn<Promise<string | null>, [string, unknown?]>(),
  setItemAsync: jest.fn<Promise<void>, [string, string, unknown?]>(),
  deleteItemAsync: jest.fn<Promise<void>, [string, unknown?]>(),
};
const application = { appId: 'cli_cherry', appSecret: 'private-app' };
const input = {
  pluginId: 'feishu',
  authMethod: 'feishu_user',
  serverName: 'Feishu',
  accountLabel: 'Cherry',
  credential: {
    version: 1,
    application,
    tokens: { accessToken: 'private-access', refreshToken: 'private-refresh' },
  },
};
const method = () => storage.authorizationStore('feishu', 'feishu_user', 'Feishu');
const sqlCredentials = () => db.sqlite.prepare('SELECT * FROM plugin_authorization').all();

beforeEach(async () => {
  jest.resetAllMocks();
  secrets = new Map();
  native.getItemAsync.mockImplementation(async (key) => secrets.get(key) ?? null);
  native.setItemAsync.mockImplementation(async (key, value) => {
    secrets.set(key, value);
  });
  native.deleteItemAsync.mockImplementation(async (key) => {
    secrets.delete(key);
  });
  db = createTestDb(new DatabaseSync(':memory:'));
  await installTestHost({ DbService: db.dbService });
  database = new PluginAuthorizationService();
  storage = new PluginCredentialStore(database, native);
});
afterEach(async () => {
  await storage.stop();
  await uninstallTestHost();
  db.sqlite.close();
  jest.restoreAllMocks();
});

it('keeps secrets out of SQLite and reuses the application and grant after restart', async () => {
  await method().writeApplication(application);
  await storage.connect(input);
  const grant = (await method().getGrant())!;
  expect(JSON.stringify(sqlCredentials())).not.toContain('private-');
  expect(db.sqlite.prepare('SELECT * FROM app_state').all()).toEqual([]);
  expect(native.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
    keychainAccessible: 'device-only',
  });
  expect(secrets.size).toBe(2);
  await storage.stop();
  storage = new PluginCredentialStore(database, native);
  expect(await method().readApplication()).toEqual(application);
  expect(await method().getGrant(grant.id)).toEqual(grant);
});

it('does not activate a connection when native storage fails', async () => {
  native.setItemAsync.mockRejectedValueOnce(new Error('unavailable'));
  await expect(storage.connect(input)).rejects.toMatchObject({ reason: 'storage' });
  expect(await database.listConnections()).toEqual([]);
});

it('preserves the current connection and removes the new secret when activation fails', async () => {
  const connection = await storage.connect(input);
  const original = new Map(secrets);
  jest.spyOn(database, 'connect').mockRejectedValueOnce(new Error('disk full'));
  await expect(
    storage.connect({ ...input, credential: { version: 1, token: 'next' } }),
  ).rejects.toMatchObject({ reason: 'storage' });
  expect(await database.listConnections()).toEqual([connection]);
  expect(secrets).toEqual(original);
});

it('replaces the complete token bundle without a SQL write or changing the grant identity', async () => {
  await storage.connect(input);
  const previous = (await method().getGrant())!;
  const before = sqlCredentials();
  const credential = {
    ...input.credential,
    tokens: { accessToken: 'next', refreshToken: 'rotated' },
  };
  jest.spyOn(db.dbService, 'withWriteTx').mockRejectedValue(new Error('SQLite unavailable'));
  expect(
    await method().updateCredential(previous.id, credential, new AbortController().signal),
  ).toBe(true);
  expect(sqlCredentials()).toEqual(before);
  expect(await method().getGrant()).toEqual({ id: previous.id, credential });
});

it('rejects an old grant after replacement and removes its native secret', async () => {
  await storage.connect(input);
  const previous = (await method().getGrant())!;
  await storage.connect({ ...input, credential: { version: 1, token: 'replacement' } });
  expect(
    await method().updateCredential(previous.id, input.credential, new AbortController().signal),
  ).toBe(false);
  expect(secrets.size).toBe(1);
  expect([...secrets.values()][0]).toContain('replacement');
});

it('revokes a grant even when native deletion fails, retaining the reusable application', async () => {
  await method().writeApplication(application);
  await storage.connect(input);
  const previous = (await method().getGrant())!;
  native.deleteItemAsync.mockRejectedValue(new Error('unavailable'));
  await storage.disconnect('feishu');
  expect(await database.listConnections()).toEqual([]);
  expect(await method().getGrant(previous.id)).toBeUndefined();
  expect(await method().readApplication()).toEqual(application);
});

it('does not activate a native write that finishes after the owner stops', async () => {
  let finishWrite!: () => void;
  let started!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  native.setItemAsync.mockImplementationOnce(async (key, value) => {
    started();
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    secrets.set(key, value);
  });
  const rejected = expect(storage.connect(input)).rejects.toMatchObject({ reason: 'cancelled' });
  await writing;
  const stopping = storage.stop();
  finishWrite();
  await Promise.all([rejected, stopping]);
  expect(await database.listConnections()).toEqual([]);
  expect(secrets.size).toBe(0);
});
