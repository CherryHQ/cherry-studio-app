import type { PluginAuthorizationStore } from '../pluginAuthorization';
import type { PluginCredential, PluginGrant } from '../pluginCredential';

export function authorizationStoreFixture() {
  const data: { application?: PluginCredential; grant?: PluginGrant } = {};
  let nextId = 0;
  const clone = <T>(value: T): T =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  const store: jest.Mocked<PluginAuthorizationStore> = {
    notifyChanged: jest.fn(),
    getCurrentAuthorizationId: jest.fn(async () => data.grant?.id),
    readApplication: jest.fn(async () => clone(data.application)),
    writeApplication: jest.fn(async (application) => {
      data.application = clone(application);
    }),
    getGrant: jest.fn(async (id?: string) =>
      !id || data.grant?.id === id ? clone(data.grant) : undefined,
    ),
    updateCredential: jest.fn(
      async (id: string, credential: PluginCredential, signal: AbortSignal) => {
        signal.throwIfAborted();
        if (data.grant?.id !== id) return false;
        data.grant = { id, credential: clone(credential) };
        return true;
      },
    ),
    commit: jest.fn(
      async (credential: PluginCredential, accountLabel: string, signal: AbortSignal) => {
        signal.throwIfAborted();
        data.grant = { id: `grant-${++nextId}`, credential: clone(credential) };
        return {
          pluginId: 'feishu',
          serverId: 'server-1',
          accountLabel,
          connectedAt: new Date().toISOString(),
        };
      },
    ),
  };
  return { data, store };
}
