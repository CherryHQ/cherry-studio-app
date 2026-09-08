import { createPluginsModule } from '../createPluginsModule';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockList = jest.fn();
const mockGetAccount = jest.fn();
const mockValidateAmap = jest.fn();
const mockEncrypt = jest.fn();
const mockRemoveKey = jest.fn();
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
jest.mock('../credentialEncryption', () => ({
  encryptPluginCredential: (...args: unknown[]) => mockEncrypt(...args),
  removePluginCredentialKey: (...args: unknown[]) => mockRemoveKey(...args),
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
  mockEncrypt.mockResolvedValue({ credentialCiphertext: 'sealed', credentialKeyId: 'new-key' });
  mockConnect.mockResolvedValue({ connection, oldKeyId: 'old-key' });
  mockRemoveKey.mockResolvedValue(undefined);
  mockList.mockResolvedValue([connection]);
  mockDisconnect.mockResolvedValue({ serverId: 'server-1', keyId: 'new-key' });
});

it('validates credentials before storage and removes only the newly staged key on commit failure', async () => {
  const invalidateServer = jest.fn();
  const plugins = createPluginsModule({ invalidateServer });
  mockGetAccount.mockRejectedValueOnce(new Error('invalid token'));
  await expect(plugins.connect(input)).rejects.toThrow('invalid token');
  expect(mockEncrypt).not.toHaveBeenCalled();
  mockConnect.mockRejectedValueOnce(new Error('storage error'));
  await expect(plugins.connect(input)).rejects.toThrow('Could not save');
  expect(mockRemoveKey.mock.calls).toEqual([['new-key']]);
  expect(invalidateServer).not.toHaveBeenCalled();
});

it('retires the old connection and key only after the new grant commits', async () => {
  const operations: string[] = [];
  mockConnect.mockImplementation(async () => {
    operations.push('commit');
    return { connection, oldKeyId: 'old-key' };
  });
  mockRemoveKey.mockImplementation(async () => {
    operations.push('remove-old-key');
  });
  const plugins = createPluginsModule({ invalidateServer: () => operations.push('invalidate') });
  await expect(plugins.connect(input)).resolves.toEqual(connection);
  expect(operations).toEqual(['commit', 'invalidate', 'remove-old-key']);
  expect(mockConnect.mock.calls[0][0]).toEqual({
    pluginId: 'github',
    accountLabel: 'cherry',
    credentialCiphertext: 'sealed',
    credentialKeyId: 'new-key',
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
    return { connection };
  });
  mockDisconnect.mockImplementation(async () => {
    operations.push('disconnect');
    return { serverId: 'server-1', keyId: 'new-key' };
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

it('removes staged credentials when the authorization form is cancelled before commit', async () => {
  const controller = new AbortController();
  mockEncrypt.mockImplementation(async () => {
    controller.abort();
    return { credentialCiphertext: 'sealed', credentialKeyId: 'new-key' };
  });
  const plugins = createPluginsModule({ invalidateServer: jest.fn() });
  await expect(plugins.connect(input, controller.signal)).rejects.toThrow();
  expect(mockConnect).not.toHaveBeenCalled();
  expect(mockRemoveKey).toHaveBeenCalledWith('new-key');
});
