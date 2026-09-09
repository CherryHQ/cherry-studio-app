import type { MCPTransport } from '@ai-sdk/mcp';

import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import type { PluginId } from '@/shared/data/types/plugin';

import { BuiltInMcpTransport } from './BuiltInMcpTransport';
import { createAmapClient } from './providers/amap';
import { createGitHubClient } from './providers/github';

export function createBuiltInMcpTransport(
  pluginId: PluginId,
  authorizationId: string,
): MCPTransport {
  const getCredential = async () =>
    (await pluginAuthorizationService.getCredentialGrant(pluginId, authorizationId)).credential;
  const provider =
    pluginId === 'github' ? createGitHubClient(getCredential) : createAmapClient(getCredential);
  return new BuiltInMcpTransport(pluginId, provider.tools, async () => {
    await getCredential();
  });
}
