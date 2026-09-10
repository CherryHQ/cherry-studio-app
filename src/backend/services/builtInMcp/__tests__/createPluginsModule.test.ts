import { authorizationStoreFixture } from '../authorization/__tests__/_authorizationStoreFixture';
import { PluginAuthorizationManager } from '../authorization/PluginAuthorizationManager';
import { createPluginsModule as createModule } from '../createPluginsModule';
import type { FeishuAuthorizationRuntime } from '../plugins/feishu/FeishuAuthorizationRuntime';

function createPluginsModule(runtime: Parameters<typeof createModule>[0]) {
  return createModule(runtime, authorizations);
}

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockList = jest.fn();
const mockValidateConnection = jest.fn();
jest.mock('@/backend/data/services/PluginAuthorizationService', () => ({
  pluginAuthorizationService: {
    listConnections: (...args: unknown[]) => mockList(...args),
  },
}));
jest.mock('../transport/validatePluginConnection', () => ({
  validatePluginConnection: (...args: unknown[]) => mockValidateConnection(...args),
}));
jest.mock('../authorization/PluginCredentialStore', () => ({
  PluginCredentialStore: class {
    authorizationStore() {
      return mockFixture.store;
    }
    connect(...args: unknown[]) {
      return mockConnect(...args);
    }
    disconnect(...args: unknown[]) {
      return mockDisconnect(...args);
    }
    async stop() {}
  },
}));

const input = { pluginId: 'github', authMethod: 'personal_token', fields: { token: 'test-token' } };
const connection = {
  pluginId: 'github',
  accountLabel: 'cherry',
  serverId: 'server-1',
  connectedAt: '2026-09-09T00:00:00.000Z',
};
let mockFixture: ReturnType<typeof authorizationStoreFixture>;
let authorizations: PluginAuthorizationManager;
beforeEach(() => {
  jest.resetAllMocks();
  mockFixture = authorizationStoreFixture();
  authorizations = new PluginAuthorizationManager();
  mockValidateConnection.mockResolvedValue('cherry');
  mockConnect.mockResolvedValue(connection);
  mockList.mockResolvedValue([connection]);
  mockDisconnect.mockResolvedValue({ serverId: 'server-1' });
});
afterEach(async () => {
  await authorizations.stop();
  jest.restoreAllMocks();
});

it('commits an observed ready attempt only after read-only validation of its selected method', async () => {
  const auth = authorizations.get('feishu', 'feishu_user') as FeishuAuthorizationRuntime;
  const credential = {
    version: 1,
    application: { appId: 'cli_cherry', appSecret: 'secret' },
    tokens: { accessToken: 'user-token' },
  };
  const signal = auth.attemptSignal;
  jest
    .spyOn(auth, 'getState')
    .mockResolvedValue({ status: 'ready', attemptId: '00000000-0000-4000-8000-000000000001' });
  jest
    .spyOn(auth, 'prepare')
    .mockResolvedValue({ credential, accountLabel: 'Cherry (ou_cherry)', signal });
  const commit = jest.spyOn(auth, 'commit').mockResolvedValue(connection);
  const invalidateServer = jest.fn();
  const plugins = createModule({ invalidateServer }, authorizations);
  const connected = new Promise<unknown>((resolve) => {
    plugins.authorization.observe('feishu', 'feishu_user', (observation) => {
      if (observation.connection) resolve(observation.connection);
    });
  });
  await expect(connected).resolves.toEqual(connection);
  expect(mockValidateConnection).toHaveBeenCalledWith('feishu', 'feishu_user', credential, signal);
  expect(commit).toHaveBeenCalledWith(
    '00000000-0000-4000-8000-000000000001',
    'Cherry (ou_cherry)',
    signal,
  );
  expect(invalidateServer).toHaveBeenCalledWith(connection.serverId);
  await auth.stop();
});

it('saves an existing application through the plugin field rules before user authorization', async () => {
  const auth = authorizations.get('feishu', 'feishu_user') as FeishuAuthorizationRuntime;
  const useApplication = jest
    .spyOn(auth, 'useApplication')
    .mockResolvedValue({ status: 'application-ready', applicationId: 'cli_cherry' });
  const plugins = createModule({ invalidateServer: jest.fn() }, authorizations);
  expect(() =>
    plugins.authorization.useApplication('feishu', 'feishu_user', {
      appId: 'bad id',
      appSecret: 'secret',
    }),
  ).toThrow();
  expect(() =>
    plugins.authorization.useApplication('github', 'personal_token', { token: 'secret' }),
  ).toThrow('unavailable');
  await expect(
    plugins.authorization.useApplication('feishu', 'feishu_user', {
      appId: ' cli_cherry ',
      appSecret: 'secret',
    }),
  ).resolves.toEqual({ status: 'application-ready', applicationId: 'cli_cherry' });
  expect(useApplication).toHaveBeenCalledWith({ appId: 'cli_cherry', appSecret: 'secret' });
  await auth.stop();
});

it('invalidates pending user authorization synchronously and keeps the application on disconnect', async () => {
  const auth = authorizations.get('feishu', 'feishu_user') as FeishuAuthorizationRuntime;
  const cancel = jest
    .spyOn(auth, 'cancel')
    .mockResolvedValue({ status: 'application-ready', applicationId: 'cli_cherry' });
  const signal = auth.attemptSignal;
  const disconnect = createModule({ invalidateServer: jest.fn() }, authorizations).disconnect(
    'feishu',
  );
  expect(signal.aborted).toBe(true);
  await disconnect;
  expect(cancel).toHaveBeenCalledTimes(1);
  await auth.stop();
});

it('validates credentials upstream before storing anything', async () => {
  const invalidateServer = jest.fn();
  const plugins = createPluginsModule({ invalidateServer });
  mockValidateConnection.mockRejectedValueOnce(new Error('invalid token'));
  await expect(plugins.connect(input)).rejects.toThrow('invalid token');
  expect(mockConnect).not.toHaveBeenCalled();
  mockConnect.mockRejectedValueOnce(new Error('storage error'));
  await expect(plugins.connect(input)).rejects.toThrow('Could not save');
  expect(invalidateServer).not.toHaveBeenCalled();
});

it('requires Feishu application credentials and stores both only in the backend grant', async () => {
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  expect(() =>
    plugins.connect({
      pluginId: 'feishu',
      authMethod: 'app_credentials',
      fields: { appSecret: 'secret' },
    }),
  ).toThrow();
  expect(mockValidateConnection).not.toHaveBeenCalled();
  mockValidateConnection.mockResolvedValue('cli_cherry');
  await plugins.connect({
    pluginId: 'feishu',
    authMethod: 'app_credentials',
    fields: { appId: 'cli_cherry', appSecret: 'secret' },
  });
  const credential = { version: 1, appId: 'cli_cherry', appSecret: 'secret' };
  expect(mockValidateConnection.mock.calls[0][2]).toEqual(credential);
  expect(mockConnect.mock.calls[0][0]).toEqual({
    pluginId: 'feishu',
    authMethod: 'app_credentials',
    serverName: '飞书',
    accountLabel: 'cli_cherry',
    credential,
  });
});

it('invalidates the runtime only after the new grant commits', async () => {
  const operations: string[] = [];
  mockConnect.mockImplementation(async () => {
    operations.push('commit');
    return connection;
  });
  const plugins = createPluginsModule({ invalidateServer: () => operations.push('invalidate') });
  await expect(plugins.connect(input)).resolves.toEqual(connection);
  expect(operations).toEqual(['commit', 'invalidate']);
  expect(mockConnect.mock.calls[0][0]).toEqual({
    pluginId: 'github',
    authMethod: 'personal_token',
    serverName: 'GitHub',
    accountLabel: 'cherry',
    credential: { version: 1, token: 'test-token' },
  });
});

it('serializes disconnect behind an in-progress connect and leaves it disconnected', async () => {
  let finishValidation!: () => void;
  mockValidateConnection.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishValidation = () => resolve('cherry');
      }),
  );
  const operations: string[] = [];
  mockConnect.mockImplementation(async () => {
    operations.push('connect');
    return connection;
  });
  mockDisconnect.mockImplementation(async () => {
    operations.push('disconnect');
    return { serverId: 'server-1' };
  });
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  const connect = plugins.connect(input);
  const disconnect = plugins.disconnect('github');
  await new Promise((resolve) => setImmediate(resolve));
  expect(mockDisconnect).not.toHaveBeenCalled();
  finishValidation();
  await Promise.all([connect, disconnect]);
  expect(operations).toEqual(['connect', 'disconnect']);
});

it('does not commit when the authorization form is cancelled after validation', async () => {
  const controller = new AbortController();
  mockValidateConnection.mockImplementation(async () => {
    controller.abort();
    return 'cherry';
  });
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  await expect(plugins.connect(input, controller.signal)).rejects.toThrow();
  expect(mockConnect).not.toHaveBeenCalled();
});

it('rejects unregistered plugins and invalid plugin-owned fields before network or persistence', () => {
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  expect(() =>
    plugins.connect({
      pluginId: 'future',
      authMethod: 'personal_token',
      fields: { token: 'secret' },
    }),
  ).toThrow('not available');
  for (const fields of [
    { token: 'bad key' },
    { token: 'secret', unexpected: 'value' },
    {},
  ] as Record<string, string>[]) {
    expect(() =>
      plugins.connect({ pluginId: 'github', authMethod: 'personal_token', fields }),
    ).toThrow();
  }
  expect(mockValidateConnection).not.toHaveBeenCalled();
  expect(mockConnect).not.toHaveBeenCalled();
});

it('allows disconnecting a plugin no longer bundled by this app version', async () => {
  mockList.mockResolvedValue([{ ...connection, pluginId: 'future' }]);
  const invalidateServer = jest.fn();
  await createPluginsModule({ invalidateServer }).disconnect('future');
  expect(invalidateServer).toHaveBeenCalledWith(connection.serverId);
  expect(mockDisconnect).toHaveBeenCalledWith('future');
});
