import type {
  PluginAuthorizationStore,
  PluginGrant,
} from '@/backend/data/services/PluginAuthorizationService';
import type { PluginCredential } from '@/shared/data/types/plugin';

/** JSON round-trips model persistence boundaries; transaction rollback is covered in the data suite. */
export function authorizationStoreFixture() {
  const data: { state?: PluginCredential; grant?: PluginGrant } = {};
  let nextId = 0;
  const clone = <T>(value: T): T =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  const store: jest.Mocked<PluginAuthorizationStore> = {
    readState: jest.fn(async () => clone(data.state)),
    writeState: jest.fn(async (state: PluginCredential) => {
      data.state = clone(state);
    }),
    initializeState: jest.fn(
      async (
        state: PluginCredential,
        migrated?: { previous: PluginGrant; credential: PluginCredential },
      ) => {
        if (data.state) return;
        if (
          migrated &&
          data.grant?.id === migrated.previous.id &&
          JSON.stringify(data.grant.credential) === JSON.stringify(migrated.previous.credential)
        )
          data.grant = { id: data.grant.id, credential: clone(migrated.credential) };
        data.state = clone(state);
      },
    ),
    getGrant: jest.fn(async (id?: string) =>
      !id || data.grant?.id === id ? clone(data.grant) : undefined,
    ),
    updateCredential: jest.fn(
      async (previous: PluginGrant, credential: PluginCredential, signal: AbortSignal) => {
        signal.throwIfAborted();
        if (
          data.grant?.id !== previous.id ||
          JSON.stringify(data.grant.credential) !== JSON.stringify(previous.credential)
        )
          return false;
        data.grant = { id: previous.id, credential: clone(credential) };
        return true;
      },
    ),
    commit: jest.fn(
      async (
        credential: PluginCredential,
        accountLabel: string,
        state: PluginCredential,
        signal: AbortSignal,
      ) => {
        signal.throwIfAborted();
        data.grant = { id: `grant-${++nextId}`, credential: clone(credential) };
        data.state = clone(state);
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
