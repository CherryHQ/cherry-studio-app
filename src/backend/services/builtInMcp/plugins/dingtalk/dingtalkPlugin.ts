import type { PluginDefinition } from '../../pluginDefinition';
import { createDingtalkClient } from './createDingtalkClient';
import { parseDingtalkConfig } from './dingtalkCredentials';
import { DINGTALK_TOOL_POLICY } from './dingtalkTools';
import { dingtalkGuide } from './guide';

export const dingtalkPlugin: PluginDefinition = {
  serverName: '钉钉',
  guide: dingtalkGuide,
  catalog: {
    id: 'dingtalk',
    icon: 'file-text',
    links: {
      credentials:
        'https://github.com/CherryHQ/cherry-studio-app/blob/v0.2/docs/guides/dingtalk-plugin-authorization.md',
      website: 'https://www.dingtalk.com',
      privacy:
        'https://terms.alicdn.com/legal-agreement/terms/suit_bu1_ali_third/suit_bu1_ali_third202003041308_00006.html',
    },
  },
  tools: DINGTALK_TOOL_POLICY,
  authMethods: [
    {
      id: 'official_mcp',
      kind: 'credentials',
      requiresDisconnect: true,
      fields: [{ id: 'configuration', secret: true, maxLength: 16_384 }],
      encodeCredentials: (fields) => parseDingtalkConfig(fields.configuration),
      // Each imported session binds its own URL and headers in createDingtalkClient.
      createRequestAuthorization: () => ({ apply() {} }),
    },
  ],
  createClient: createDingtalkClient,
  // Discovery verifies access only, not the identity of an individual employee or organization.
  validation: { accountLabel: () => 'Official MCP' },
};
