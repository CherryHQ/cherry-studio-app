import { createPluginsModule } from '../createPluginsModule';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockList = jest.fn();
const mockGetAccount = jest.fn();
const mockValidateAmap = jest.fn();
jest.mock('@/backend/data/services/PluginAuthorizationService', () => ({
  pluginAuthorizationService: {
    connect: (...args: unknown[]) => mockConnect(...args),
    disconnect: (...args: unknown[]) => mockDisconnect(...args),
    listConnections: (...args: unknown[]) => mockList(...args),
  },
}));
jest.mock('../providers/github', () => ({
  createGitHubClient: () => ({ getAccount: mockGetAccount }),
}));
jest.mock('../providers/amap', () => ({
  createAmapClient: () => ({ validateCredential: mockValidateAmap }),
}));

const input = { pluginId: 'github' as const, credential: 'test-token' };
const connection = {
  pluginId: 'github',
  accountLabel: 'cherry',
  serverId: 'server-1',
  connectedAt: '2026-09-09T00:00:00.000Z',
};
beforeEach(() => {
  jest.resetAllMocks();
  mockGetAccount.mockResolvedValue({ login: 'cherry' });
  mockConnect.mockResolvedValue(connection);
  mockList.mockResolvedValue([connection]);
  mockDisconnect.mockResolvedValue({ serverId: 'server-1' });
});

it('validates credentials upstream before storing anything', async () => {
  const invalidateServer = jest.fn();
  const plugins = createPluginsModule({ invalidateServer });
  mockGetAccount.mockRejectedValueOnce(new Error('invalid token'));
  await expect(plugins.connect(input)).rejects.toThrow('invalid token');
  expect(mockConnect).not.toHaveBeenCalled();
  mockConnect.mockRejectedValueOnce(new Error('storage error'));
  await expect(plugins.connect(input)).rejects.toThrow('Could not save');
  expect(invalidateServer).not.toHaveBeenCalled();
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
    accountLabel: 'cherry',
    credential: 'test-token',
  });
});

it('serializes disconnect behind an in-progress connect and leaves it disconnected', async () => {
  let finishValidation!: () => void;
  mockGetAccount.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishValidation = () => resolve({ login: 'cherry' });
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
  mockGetAccount.mockImplementation(async () => {
    controller.abort();
    return { login: 'cherry' };
  });
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  await expect(plugins.connect(input, controller.signal)).rejects.toThrow();
  expect(mockConnect).not.toHaveBeenCalled();
});
