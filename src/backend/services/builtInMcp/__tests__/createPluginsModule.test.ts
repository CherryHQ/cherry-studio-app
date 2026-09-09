import { createPluginsModule } from '../createPluginsModule';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockList = jest.fn();
const mockValidateCredential = jest.fn();
jest.mock('@/backend/data/services/PluginAuthorizationService', () => ({
  pluginAuthorizationService: {
    connect: (...args: unknown[]) => mockConnect(...args),
    disconnect: (...args: unknown[]) => mockDisconnect(...args),
    listConnections: (...args: unknown[]) => mockList(...args),
  },
}));
jest.mock('../createBuiltInMcpClient', () => ({
  validatePluginCredential: (...args: unknown[]) => mockValidateCredential(...args),
}));

const input = { pluginId: 'github', fields: { token: 'test-token' } };
const connection = {
  pluginId: 'github',
  accountLabel: 'cherry',
  serverId: 'server-1',
  connectedAt: '2026-09-09T00:00:00.000Z',
};
beforeEach(() => {
  jest.resetAllMocks();
  mockValidateCredential.mockResolvedValue('cherry');
  mockConnect.mockResolvedValue(connection);
  mockList.mockResolvedValue([connection]);
  mockDisconnect.mockResolvedValue({ serverId: 'server-1' });
});

it('validates credentials upstream before storing anything', async () => {
  const invalidateServer = jest.fn();
  const plugins = createPluginsModule({ invalidateServer });
  mockValidateCredential.mockRejectedValueOnce(new Error('invalid token'));
  await expect(plugins.connect(input)).rejects.toThrow('invalid token');
  expect(mockConnect).not.toHaveBeenCalled();
  mockConnect.mockRejectedValueOnce(new Error('storage error'));
  await expect(plugins.connect(input)).rejects.toThrow('Could not save');
  expect(invalidateServer).not.toHaveBeenCalled();
});

it('requires Feishu application credentials and stores both only in the backend grant', async () => {
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  expect(() => plugins.connect({ pluginId: 'feishu', fields: { appSecret: 'secret' } })).toThrow();
  expect(mockValidateCredential).not.toHaveBeenCalled();
  mockValidateCredential.mockResolvedValue('cli_cherry');
  await plugins.connect({
    pluginId: 'feishu',
    fields: { appId: 'cli_cherry', appSecret: 'secret' },
  });
  const credential = JSON.stringify({ appId: 'cli_cherry', appSecret: 'secret' });
  expect(mockValidateCredential.mock.calls[0][1]).toBe(credential);
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
    credential: 'test-token',
  });
});

it('serializes disconnect behind an in-progress connect and leaves it disconnected', async () => {
  let finishValidation!: () => void;
  mockValidateCredential.mockImplementation(
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
  mockValidateCredential.mockImplementation(async () => {
    controller.abort();
    return 'cherry';
  });
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  await expect(plugins.connect(input, controller.signal)).rejects.toThrow();
  expect(mockConnect).not.toHaveBeenCalled();
});

it('rejects unregistered plugins and invalid plugin-owned fields before network or persistence', () => {
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  expect(() => plugins.connect({ pluginId: 'future', fields: { token: 'secret' } })).toThrow(
    'not available',
  );
  for (const fields of [
    { token: 'bad key' },
    { token: 'secret', unexpected: 'value' },
    {},
  ] as Record<string, string>[]) {
    expect(() => plugins.connect({ pluginId: 'github', fields })).toThrow();
  }
  expect(mockValidateCredential).not.toHaveBeenCalled();
  expect(mockConnect).not.toHaveBeenCalled();
});

it('allows disconnecting a plugin no longer bundled by this app version', async () => {
  mockList.mockResolvedValue([{ ...connection, pluginId: 'future' }]);
  const invalidateServer = jest.fn();
  await createPluginsModule({ invalidateServer }).disconnect('future');
  expect(invalidateServer).toHaveBeenCalledWith(connection.serverId);
  expect(mockDisconnect).toHaveBeenCalledWith('future');
});
