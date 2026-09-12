import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import { PluginError } from '@/shared/contracts/plugins';
import type { PluginId } from '@/shared/data/types/plugin';

import type { PluginAuthorizationManager } from '../authorization/PluginAuthorizationManager';
import type { PluginClient } from '../pluginDefinition';
import { requirePluginDefinition } from '../pluginRegistry';

/** Bind a client to a registered plugin and one durable grant, checked before every request. */
export async function createBuiltInMcpClient(
  pluginId: PluginId,
  authorizationId: string,
  signal: AbortSignal,
  authorizations: Pick<PluginAuthorizationManager, 'get'> & {
    credentials: Pick<PluginAuthorizationManager['credentials'], 'getCredentialGrant'>;
  },
): Promise<PluginClient> {
  const plugin = requirePluginDefinition(pluginId);
  const initial = await pluginAuthorizationService
    .getAuthorizedGrant(pluginId, authorizationId)
    .catch(() => {
      throw new PluginError('authorization', 'The plugin authorization is no longer available.');
    });
  const method = plugin.authMethods.find((candidate) => candidate.id === initial.authMethod);
  if (!method)
    throw new PluginError(
      'authorization',
      'The plugin authorization method is unavailable. Reconnect the plugin.',
    );
  const methodId = method.id;
  async function readGrant() {
    const grant = await pluginAuthorizationService.getAuthorizedGrant(pluginId, authorizationId);
    if (grant.authMethod !== methodId)
      throw new PluginError(
        'authorization',
        'The plugin authorization method changed. Reconnect the plugin.',
      );
    return grant;
  }
  return plugin.createClient({
    pluginId,
    tools: plugin.tools,
    signal,
    authorization: method.createRequestAuthorization(plugin.tools),
    rejectCredential:
      method.kind === 'interactive'
        ? (credential) =>
            authorizations
              .get(pluginId, method.id)
              .rejectCredential?.(authorizationId, credential) ?? Promise.resolve()
        : undefined,
    async assertAuthorized() {
      await readGrant();
    },
    async getCredential(callerSignal) {
      const grant = await readGrant();
      return method.kind === 'interactive'
        ? authorizations.get(pluginId, method.id).resolveCredential(grant.id, callerSignal)
        : (await authorizations.credentials.getCredentialGrant(pluginId, authorizationId))
            .credential;
    },
  });
}
