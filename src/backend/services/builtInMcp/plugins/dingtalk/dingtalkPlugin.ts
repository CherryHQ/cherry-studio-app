import type { PluginDefinition } from '../../pluginDefinition';
import { createDingtalkClient } from './createDingtalkClient';
import { DingtalkAuthorizationRuntime } from './DingtalkAuthorizationRuntime';
import { DingtalkUserCredentialSchema } from './dingtalkCredentials';
import { DINGTALK_MANAGEMENT_URL } from './dingtalkOauth';
import { DINGTALK_TOOL_POLICY } from './dingtalkTools';
import { dingtalkGuide } from './guide';

export const dingtalkPlugin: PluginDefinition = {
  serverName: '钉钉',
  guide: dingtalkGuide,
  catalog: {
    id: 'dingtalk',
    icon: 'file-text',
    links: {
      credentials: 'https://mcp.dingtalk.com',
      website: 'https://www.dingtalk.com',
      authorizationManagement: DINGTALK_MANAGEMENT_URL,
      privacy:
        'https://terms.alicdn.com/legal-agreement/terms/suit_bu1_ali_third/suit_bu1_ali_third202003041308_00006.html',
    },
  },
  tools: DINGTALK_TOOL_POLICY,
  authMethods: [
    {
      id: 'dingtalk_user',
      kind: 'interactive',
      interaction: 'polling',
      stages: ['user', 'account', 'permission'],
      createRuntime: (store) => new DingtalkAuthorizationRuntime(store),
      createRequestAuthorization: () => ({
        apply(credential, { headers }) {
          const parsed = DingtalkUserCredentialSchema.parse(credential);
          headers.set('Authorization', `Bearer ${parsed.tokens.accessToken}`);
          headers.set('x-user-access-token', parsed.tokens.accessToken);
          // Official OSS edition routing value (pkg/edition/default.go), not a private channel ID.
          headers.set('claw-type', 'openClaw');
        },
      }),
    },
  ],
  createClient: createDingtalkClient,
  // The authorization runtime reviews account identity; discovery verifies service access.
  validation: { accountLabel: () => 'Official MCP' },
};
