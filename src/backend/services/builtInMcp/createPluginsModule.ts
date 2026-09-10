import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import { ConnectPluginSchema, PluginError, type PluginsModule } from '@/shared/contracts/plugins';
import { PluginIdSchema, type PluginId } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { validatePluginCredential } from './createBuiltInMcpClient';
import type { FeishuAuthorizationRuntime } from './FeishuAuthorizationRuntime';
import { requirePluginDefinition } from './pluginRegistry';

export function createPluginsModule(
  runtime: { invalidateServer(id: string): void },
  feishuAuthorization: FeishuAuthorizationRuntime,
): PluginsModule {
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
  function authorization(pluginId: PluginId) {
    const plugin = requirePluginDefinition(pluginId);
    if (plugin.catalog.interactiveAuthorization !== 'feishu-device')
      throw new PluginError(
        'unavailable',
        'Interactive authorization is unavailable for this plugin.',
      );
    return feishuAuthorization;
  }
  return {
    authorization: {
      getState: (pluginId) => authorization(pluginId).getState(),
      begin: (pluginId) => authorization(pluginId).begin(),
      poll: (pluginId, attemptId, observationSignal) =>
        authorization(pluginId).poll(attemptId, observationSignal),
      cancel: (pluginId) => authorization(pluginId).cancel(),
      resetApplication: (pluginId) => authorization(pluginId).resetApplication(),
      complete(pluginId, attemptId) {
        const auth = authorization(pluginId);
        const attemptSignal = auth.attemptSignal;
        return serialize(pluginId, async () => {
          const { credential, accountLabel, signal } = await auth.prepare(attemptId, attemptSignal);
          await validatePluginCredential(pluginId, credential, signal, auth.getUserToken);
          const plugin = requirePluginDefinition(pluginId);
          return auth.commit(attemptId, signal, async () => {
            let connection;
            try {
              connection = await pluginAuthorizationService.connect(
                {
                  pluginId,
                  credential,
                  accountLabel,
                  authMethod: 'feishu_user',
                  serverName: plugin.serverName ?? plugin.catalog.name.default,
                },
                signal,
              );
            } catch {
              if (signal.aborted)
                throw new PluginError('cancelled', 'Feishu authorization cancelled.');
              throw new PluginError('storage', 'Could not save plugin authorization.');
            }
            runtime.invalidateServer(connection.serverId);
            return connection;
          });
        });
      },
    },
    connect(input, signal) {
      const parsed = ConnectPluginSchema.parse(input);
      const plugin = requirePluginDefinition(parsed.pluginId);
      const fields = createPluginCredentialsSchema(plugin.catalog.credentialFields).parse(
        parsed.fields,
      );
      return serialize(parsed.pluginId, async () => {
        if (plugin.catalog.interactiveAuthorization) feishuAuthorization.interrupt();
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
        if (plugin.catalog.interactiveAuthorization) await feishuAuthorization.clear();
        return connection;
      });
    },
    disconnect(pluginId) {
      PluginIdSchema.parse(pluginId);
      if (pluginId === 'feishu') feishuAuthorization.interrupt();
      return serialize(pluginId, async () => {
        const connection = (await pluginAuthorizationService.listConnections()).find(
          (item) => item.pluginId === pluginId,
        );
        if (connection) runtime.invalidateServer(connection.serverId);
        await pluginAuthorizationService.disconnect(pluginId);
        if (pluginId === 'feishu') await feishuAuthorization.clear();
      });
    },
  };
}
