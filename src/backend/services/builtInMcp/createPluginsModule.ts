import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import {
  ConnectPluginSchema,
  PluginError,
  type PluginAuthorizationState,
  type PluginsModule,
} from '@/shared/contracts/plugins';
import { PluginIdSchema, type PluginId } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import type { PluginAuthorizationManager } from './authorization/PluginAuthorizationManager';
import { requirePluginAuthMethod, requirePluginDefinition } from './pluginRegistry';
import { validatePluginConnection } from './transport/validatePluginConnection';

export function createPluginsModule(
  runtime: { invalidateServer(id: string): void },
  authorizations: PluginAuthorizationManager,
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
  function complete(pluginId: PluginId, methodId: string, attemptId: string) {
    const auth = authorizations.get(pluginId, methodId);
    const attemptSignal = auth.attemptSignal;
    authorizations.interrupt(pluginId, methodId);
    return serialize(pluginId, async () => {
      await authorizations.cancelAttempts(pluginId, methodId);
      const { credential, accountLabel, signal } = await auth.prepare(attemptId, attemptSignal);
      await validatePluginConnection(pluginId, methodId, credential, signal);
      let connection;
      try {
        connection = await auth.commit(attemptId, accountLabel, signal);
      } catch (error) {
        if (signal.aborted) throw new PluginError('cancelled', 'Plugin authorization cancelled.');
        if (error instanceof PluginError) throw error;
        throw new PluginError('storage', 'Could not save plugin authorization.');
      }
      authorizations.invalidateGrant(pluginId);
      runtime.invalidateServer(connection.serverId);
      return connection;
    });
  }
  function observer(pluginId: PluginId, methodId: string) {
    return authorizations.observer(pluginId, methodId, (attemptId) =>
      complete(pluginId, methodId, attemptId),
    );
  }
  async function step(
    pluginId: PluginId,
    methodId: string,
    action: () => Promise<PluginAuthorizationState>,
  ) {
    try {
      return await action();
    } finally {
      observer(pluginId, methodId).check();
    }
  }
  return {
    authorization: {
      observe: (pluginId, methodId, listener) => observer(pluginId, methodId).observe(listener),
      check: (pluginId, methodId) => observer(pluginId, methodId).check(),
      begin: (pluginId, methodId) =>
        step(pluginId, methodId, () => authorizations.get(pluginId, methodId).begin()),
      useApplication(pluginId, methodId, fields) {
        const method = requirePluginAuthMethod(requirePluginDefinition(pluginId), methodId);
        const auth = authorizations.get(pluginId, methodId);
        if (method.kind !== 'interactive' || !method.applicationFields || !auth.useApplication)
          throw new PluginError(
            'unavailable',
            'This method does not accept an existing application.',
          );
        const parsed = createPluginCredentialsSchema(method.applicationFields).parse(fields);
        return step(pluginId, methodId, () => auth.useApplication!(parsed));
      },
      cancel: (pluginId, methodId) =>
        step(pluginId, methodId, () => authorizations.get(pluginId, methodId).cancel()),
      resetApplication(pluginId, methodId) {
        const auth = authorizations.get(pluginId, methodId);
        if (!auth.resetApplication)
          throw new PluginError('unavailable', 'This method does not store an application.');
        return step(pluginId, methodId, () => auth.resetApplication!());
      },
    },
    connect(input, signal) {
      const parsed = ConnectPluginSchema.parse(input);
      const plugin = requirePluginDefinition(parsed.pluginId);
      const method = requirePluginAuthMethod(plugin, parsed.authMethod);
      if (method.kind !== 'credentials')
        throw new PluginError(
          'unavailable',
          'Use the interactive authorization flow for this method.',
        );
      const fields = createPluginCredentialsSchema(method.fields).parse(parsed.fields);
      authorizations.interrupt(parsed.pluginId);
      return serialize(parsed.pluginId, async () => {
        signal?.throwIfAborted();
        const credential = method.encodeCredentials(fields);
        const accountLabel = await validatePluginConnection(
          parsed.pluginId,
          method.id,
          credential,
          signal,
        );
        signal?.throwIfAborted();
        await authorizations.cancelAttempts(parsed.pluginId);
        let connection;
        try {
          connection = await authorizations.credentials.connect(
            {
              pluginId: parsed.pluginId,
              authMethod: method.id,
              serverName: plugin.serverName,
              accountLabel,
              credential,
            },
            signal,
          );
        } catch {
          if (signal?.aborted) throw new PluginError('cancelled', 'Plugin connection cancelled.');
          throw new PluginError(
            'storage',
            'Could not save plugin authorization. Try connecting again.',
          );
        }
        authorizations.invalidateGrant(parsed.pluginId);
        runtime.invalidateServer(connection.serverId);
        return connection;
      });
    },
    disconnect(pluginId) {
      PluginIdSchema.parse(pluginId);
      authorizations.interrupt(pluginId);
      authorizations.invalidateGrant(pluginId);
      return serialize(pluginId, async () => {
        const connection = (await pluginAuthorizationService.listConnections()).find(
          (item) => item.pluginId === pluginId,
        );
        if (connection) runtime.invalidateServer(connection.serverId);
        await authorizations.cancelAttempts(pluginId);
        await authorizations.credentials.disconnect(pluginId);
      });
    },
  };
}
