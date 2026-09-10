import * as SecureStore from 'expo-secure-store';

import { migrateFeishuAuthorization } from '../migrateFeishuAuthorization';
import { authorizationStoreFixture } from './authorizationStoreFixture';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const id = '00000000-0000-4000-8000-000000000001';
const application = { appId: 'cli_cherry', appSecret: 'app-secret' };
const tokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: 1000,
  refreshExpiresAt: 2000,
  scope: 'documents',
};
let fixture: ReturnType<typeof authorizationStoreFixture>;
let legacy: Map<string, string>;
beforeEach(() => {
  jest.resetAllMocks();
  fixture = authorizationStoreFixture();
  fixture.data.grant = { id: 'sqlite-grant', credential: { legacyReference: `feishu-user:${id}` } };
  legacy = new Map();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => legacy.get(key) ?? null);
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    legacy.delete(key);
  });
});

it.each(['combined', 'split'] as const)(
  'migrates %s storage and preserves a committed candidate without creating a new grant',
  async (layout) => {
    const state = { application, pending: { status: 'ready', grant: { id, application, tokens } } };
    if (layout === 'combined') legacy.set('plugins.feishu.authorization.v1', JSON.stringify(state));
    else {
      legacy.set('plugins.feishu.application.v1', JSON.stringify(application));
      legacy.set('plugins.feishu.pending.v1', JSON.stringify(state.pending));
    }
    await migrateFeishuAuthorization(fixture.store);
    expect(fixture.data.grant).toEqual({
      id: 'sqlite-grant',
      credential: { version: 1, application, tokens },
    });
    expect(fixture.data.state).toEqual({ version: 1, application });
    expect(legacy.size).toBe(0);
  },
);

it('keeps an uncommitted candidate resumable without replacing the current authorization', async () => {
  legacy.set(
    'plugins.feishu.authorization.v1',
    JSON.stringify({
      application,
      current: { id, application, tokens },
      pending: {
        status: 'ready',
        grant: {
          id: '00000000-0000-4000-8000-000000000002',
          application,
          tokens: { ...tokens, accessToken: 'candidate' },
        },
      },
    }),
  );
  await migrateFeishuAuthorization(fixture.store);
  expect(fixture.data.grant?.credential.tokens).toEqual(tokens);
  expect(fixture.data.state).toMatchObject({
    pending: { status: 'ready', credential: { tokens: { accessToken: 'candidate' } } },
  });
});

it('does not delete legacy material before a successful SQLite transaction', async () => {
  legacy.set(
    'plugins.feishu.authorization.v1',
    JSON.stringify({ application, current: { id, application, tokens } }),
  );
  fixture.store.initializeState.mockRejectedValueOnce(new Error('disk full'));
  await expect(migrateFeishuAuthorization(fixture.store)).rejects.toThrow('disk full');
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(fixture.data.grant?.credential).toEqual({ legacyReference: `feishu-user:${id}` });
  await migrateFeishuAuthorization(fixture.store);
  expect(fixture.data.grant?.credential).toEqual({ version: 1, application, tokens });
});

it('never reimports stale keys once SQLite state exists, and retries interrupted cleanup', async () => {
  fixture.data.state = { version: 1, application: { appId: 'cli_new', appSecret: 'new-secret' } };
  fixture.data.grant = { id: 'new-grant', credential: { version: 1, application, tokens } };
  legacy.set(
    'plugins.feishu.authorization.v1',
    JSON.stringify({ application, current: { id, application, tokens } }),
  );
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('locked'));
  await migrateFeishuAuthorization(fixture.store);
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(fixture.data.grant?.id).toBe('new-grant');
  expect(fixture.data.state).toMatchObject({ application: { appId: 'cli_new' } });
  await migrateFeishuAuthorization(fixture.store);
  expect(legacy.size).toBe(0);
});

it('does not fabricate credentials when the old device-only secret is missing', async () => {
  await migrateFeishuAuthorization(fixture.store);
  expect(fixture.data.grant?.credential).toEqual({ legacyReference: `feishu-user:${id}` });
  expect(fixture.data.state).toEqual({ version: 1 });
});
