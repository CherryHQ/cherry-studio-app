import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import { ConnectPluginSchema, PluginError, type PluginsModule } from '@/shared/contracts/plugins';
import { PluginIdSchema, type PluginId } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { validatePluginCredential } from './createBuiltInMcpClient';
import { requirePluginDefinition } from './pluginRegistry';

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
    connect(input, signal) {
      const parsed = ConnectPluginSchema.parse(input);
      const plugin = requirePluginDefinition(parsed.pluginId);
      const fields = createPluginCredentialsSchema(plugin.catalog.credentialFields).parse(
        parsed.fields,
      );
      return serialize(parsed.pluginId, async () => {
        signal?.throwIfAborted();
        const credential = plugin.encodeCredentials(fields);
        const accountLabel = await validatePluginCredential(parsed.pluginId, credential, signal);
        signal?.throwIfAborted();
        let connection: Awaited<ReturnType<typeof pluginAuthorizationService.connect>>;
        try {
          connection = await pluginAuthorizationService.connect(
            {
              pluginId: parsed.pluginId,
              authMethod: plugin.authMethod,
              serverName: plugin.serverName ?? plugin.catalog.name.default,
              accountLabel,
              credential,
            },
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
