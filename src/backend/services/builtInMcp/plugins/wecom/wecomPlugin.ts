import type { PluginDefinition } from '../../pluginDefinition';
import { createWecomClient } from './createWecomClient';
import { wecomGuide } from './guide';
import { parseWecomConfig } from './wecomCredentials';
import { WECOM_TOOL_POLICY } from './wecomTools';

export const wecomPlugin: PluginDefinition = {
  serverName: '企业微信',
  guide: wecomGuide,
  catalog: {
    id: 'wecom',
    icon: 'file-text',
    links: {
      credentials:
        'https://github.com/CherryHQ/cherry-studio-app/blob/v0.2/docs/guides/wecom-plugin-authorization.md',
      website: 'https://work.weixin.qq.com',
      privacy: 'https://work.weixin.qq.com/nl/privacy',
    },
  },
  tools: WECOM_TOOL_POLICY,
  authMethods: [
    {
      id: 'official_mcp',
      kind: 'credentials',
      requiresDisconnect: true,
      fields: [{ id: 'configuration', secret: true, maxLength: 16_384 }],
      encodeCredentials: (fields) => parseWecomConfig(fields.configuration),
      // Each imported session binds its own URL and headers in createWecomClient.
      createRequestAuthorization: () => ({ apply() {} }),
    },
  ],
  createClient: createWecomClient,
  // Discovery verifies access only, not the identity of an individual employee or organization.
  validation: { accountLabel: () => 'Official MCP' },
};
