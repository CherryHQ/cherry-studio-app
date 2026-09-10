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
import {
  getPluginDefinition,
  requirePluginAuthMethod,
  requirePluginDefinition,
} from './pluginRegistry';
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
    observeConnections: (listener) => authorizations.credentials.observe(listener),
    authorization: {
      observe: (pluginId, methodId, listener) => observer(pluginId, methodId).observe(listener),
      check: (pluginId, methodId) => observer(pluginId, methodId).check(),
      begin: (pluginId, methodId) =>
        step(pluginId, methodId, () => authorizations.get(pluginId, methodId).begin()),
      receiveCallback(pluginId, methodId, attemptId, url) {
        const auth = authorizations.get(pluginId, methodId);
        if (!auth.receiveCallback)
          throw new PluginError('unavailable', 'This method does not use callbacks.');
        return step(pluginId, methodId, () => auth.receiveCallback!(attemptId, url));
      },
      async receiveRedirect(pluginId, url) {
        const plugin = requirePluginDefinition(pluginId);
        for (const method of plugin.authMethods) {
          if (method.kind !== 'interactive' || method.interaction !== 'callback') continue;
          const auth = authorizations.get(pluginId, method.id);
          const state = await auth.getState();
          if (state.status !== 'callback' || !auth.receiveCallback) continue;
          // Runtime validates the exact redirect, state, deadline and single consumption.
          await step(pluginId, method.id, () => auth.receiveCallback!(state.attemptId, url));
          return;
        }
        // A cold start has no attempt; the user must begin again from the connection screen.
      },
      confirm(pluginId, methodId, attemptId) {
        const auth = authorizations.get(pluginId, methodId);
        if (!auth.confirm)
          throw new PluginError('unavailable', 'This method does not require confirmation.');
        return step(pluginId, methodId, () => auth.confirm!(attemptId));
      },
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
      cancel: (pluginId, methodId, callbackAttemptId) =>
        step(pluginId, methodId, () =>
          authorizations.get(pluginId, methodId).cancel(callbackAttemptId),
        ),
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
        if (
          method.requiresDisconnect &&
          (await pluginAuthorizationService.getCurrentGrant(parsed.pluginId))
        )
          throw new PluginError(
            'requires-disconnect',
            'Disconnect before replacing this connection.',
          );
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
            method.requiresDisconnect ? { authorizationId: undefined } : undefined,
          );
        } catch (error) {
          if (signal?.aborted) throw new PluginError('cancelled', 'Plugin connection cancelled.');
          if (error instanceof PluginError) throw error;
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
        const current = await authorizations.currentRuntime(pluginId);
        const canRevoke = !!current?.runtime.prepareRevocation;
        const revocation = canRevoke
          ? await current!.runtime.prepareRevocation!(current!.grant.id).catch(() => undefined)
          : undefined;
        await authorizations.credentials.disconnect(pluginId);
        if (!canRevoke) return { revocation: 'not-applicable' as const };
        if (!revocation)
          return {
            revocation: 'unconfirmed' as const,
            managementUrl: getPluginDefinition(pluginId)?.catalog.links.authorizationManagement,
          };
        // Local revocation and binding invalidation are complete before the remote attempt.
        try {
          const signal = AbortSignal.timeout(5000);
          await revocation.revoke(signal);
          return { revocation: 'revoked' as const, managementUrl: revocation.managementUrl };
        } catch {
          return { revocation: 'unconfirmed' as const, managementUrl: revocation.managementUrl };
        }
      });
    },
  };
}
