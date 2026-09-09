import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import {
  ConnectPluginSchema,
  PluginIdSchema,
  PluginError,
  type PluginId,
  type PluginsModule,
} from '@/shared/contracts/plugins';

import { createAmapClient } from './providers/amap';
import { createGitHubClient } from './providers/github';

export function createPluginsModule(runtime: {
  invalidateServer(id: string): void;
}): PluginsModule {
  const pending = new Map<PluginId, Promise<unknown>>();
  function serialize<T>(pluginId: PluginId, operation: () => Promise<T>): Promise<T> {
    const result = (pending.get(pluginId) ?? Promise.resolve()).catch(() => {}).then(operation);
    pending.set(pluginId, result);
    void result
      .finally(() => {
        if (pending.get(pluginId) === result) pending.delete(pluginId);
      })
      .catch(() => {});
    return result;
  }
  return {
    listConnections: () => pluginAuthorizationService.listConnections(),
    connect(input, signal) {
      const parsed = ConnectPluginSchema.parse(input);
      return serialize(parsed.pluginId, async () => {
        signal?.throwIfAborted();
        let accountLabel: string;
        if (parsed.pluginId === 'github') {
          accountLabel = (
            await createGitHubClient(async () => parsed.credential).getAccount(signal)
          ).login;
        } else {
          await createAmapClient(async () => parsed.credential).validateCredential(signal);
          accountLabel = 'Web Service';
        }
        signal?.throwIfAborted();
        let connection: Awaited<ReturnType<typeof pluginAuthorizationService.connect>>;
        try {
          connection = await pluginAuthorizationService.connect(
            { pluginId: parsed.pluginId, accountLabel, credential: parsed.credential },
            signal,
          );
        } catch {
          throw new PluginError(
            'storage',
            'Could not save plugin authorization. Try connecting again.',
          );
        }
        runtime.invalidateServer(connection.serverId);
        return connection;
      });
    },
    disconnect(pluginId) {
      PluginIdSchema.parse(pluginId);
      return serialize(pluginId, async () => {
        const connection = (await pluginAuthorizationService.listConnections()).find(
          (item) => item.pluginId === pluginId,
        );
        if (connection) runtime.invalidateServer(connection.serverId);
        await pluginAuthorizationService.disconnect(pluginId);
      });
    },
  };
}
