import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition, PluginRequestAuthorization } from '../../pluginDefinition';
import { createWecomClient } from './createWecomClient';
import { wecomGuide } from './guide';
import { WecomAuthorizationRuntime } from './WecomAuthorizationRuntime';
import { importWecomMcpConfig, readWecomCredential } from './wecomCredentials';
import { acceptsWecomTool, WECOM_TOOL_POLICY } from './wecomTools';

const authorization: PluginRequestAuthorization = {
  apply(value, { url }) {
    const credential = readWecomCredential(value);
    const connection = credential.connections.find(({ url: target }) => {
      const endpoint = new URL(target);
      return endpoint.origin === url.origin && endpoint.pathname === url.pathname;
    });
    if (!connection) throw new PluginError('access', 'The Wecom MCP service is not authorized.');
    url.search = new URL(connection.url).search;
  },
};

export const wecomPlugin: PluginDefinition = {
  serverName: '企业微信',
  guide: wecomGuide,
  catalog: {
    id: 'wecom',
    icon: 'file-text',
    links: {
      credentials: 'https://open.work.weixin.qq.com/help2/pc/21676',
      website: 'https://work.weixin.qq.com',
      privacy: 'https://work.weixin.qq.com/nl/privacy',
    },
  },
  tools: WECOM_TOOL_POLICY,
  acceptsDiscoveredTool: acceptsWecomTool,
  authMethods: [
    {
      id: 'wecom_bot',
      kind: 'interactive',
      interaction: 'polling',
      stages: ['bot'],
      createRuntime: (store) => new WecomAuthorizationRuntime(store),
      createRequestAuthorization: () => authorization,
    },
    {
      id: 'wecom_mcp',
      kind: 'credentials',
      requiresDisconnect: true,
      fields: [{ id: 'mcpConfig', secret: true, maxLength: 16_384 }],
      encodeCredentials: (fields) => importWecomMcpConfig(fields.mcpConfig),
      createRequestAuthorization: () => authorization,
    },
  ],
  createClient: createWecomClient,
  // The signed bootstrap establishes bot authorization; MCP setup only discovers tools.
  validation: {
    accountLabel: () => 'WeCom',
  },
};
