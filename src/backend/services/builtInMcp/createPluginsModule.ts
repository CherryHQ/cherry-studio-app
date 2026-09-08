import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import {
  ConnectPluginSchema,
  PluginIdSchema,
  PluginError,
  type PluginId,
  type PluginsModule,
} from '@/shared/contracts/plugins';

import { encryptPluginCredential, removePluginCredentialKey } from './credentialEncryption';
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
  // Database deletion is authoritative. Orphaned keys cannot authorize calls and
  // keychain cleanup failure must not falsely report a completed disconnect as failed.
  const removeKey = (keyId: string) => removePluginCredentialKey(keyId).catch(() => {});
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
        const encrypted = await encryptPluginCredential(parsed.pluginId, parsed.credential).catch(
          () => {
            throw new PluginError(
              'storage',
              'Could not encrypt plugin authorization on this device.',
            );
          },
        );
        let result: Awaited<ReturnType<typeof pluginAuthorizationService.connect>>;
        try {
          signal?.throwIfAborted();
          result = await pluginAuthorizationService.connect(
            {
              pluginId: parsed.pluginId,
              accountLabel,
              ...encrypted,
            },
            signal,
          );
        } catch {
          await removeKey(encrypted.credentialKeyId);
          throw new PluginError(
            'storage',
            'Could not save plugin authorization. Try connecting again.',
          );
        }
        runtime.invalidateServer(result.connection.serverId);
        if (result.oldKeyId) await removeKey(result.oldKeyId);
        return result.connection;
      });
    },
    disconnect(pluginId) {
      PluginIdSchema.parse(pluginId);
      return serialize(pluginId, async () => {
        const connection = (await pluginAuthorizationService.listConnections()).find(
          (item) => item.pluginId === pluginId,
        );
        if (connection) runtime.invalidateServer(connection.serverId);
        const deleted = await pluginAuthorizationService.disconnect(pluginId);
        if (deleted?.keyId) await removeKey(deleted.keyId);
      });
    },
  };
}
