import type { PluginDefinition } from '../../pluginDefinition';
import { createFeishuClient } from './createFeishuClient';
import { FeishuAuthorizationRuntime } from './FeishuAuthorizationRuntime';
import { FEISHU_CREDENTIAL_FIELDS, FeishuUserCredentialSchema } from './feishuCredentials';
import { FEISHU_REMOTE_TOOL_POLICY, FEISHU_TOOL_POLICY } from './feishuTools';

export const feishuPlugin: PluginDefinition = {
  serverName: '飞书',
  catalog: {
    id: 'feishu',
    icon: 'feishu',
    links: {
      credentials:
        'https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server',
      website: 'https://open.feishu.cn',
      privacy: 'https://www.feishu.cn/privacy',
    },
  },
  tools: FEISHU_TOOL_POLICY,
  authMethods: [
    {
      id: 'feishu_user',
      kind: 'interactive',
      interaction: 'polling',
      stages: ['registration', 'user'],
      applicationFields: FEISHU_CREDENTIAL_FIELDS,
      createRuntime: (store) => new FeishuAuthorizationRuntime(store),
      createRequestAuthorization: (tools) => ({
        apply(credential, { headers }) {
          const { tokens } = FeishuUserCredentialSchema.parse(credential);
          headers.set('X-Lark-MCP-UAT', tokens.accessToken);
          headers.set(
            'X-Lark-MCP-Allowed-Tools',
            Object.keys(tools)
              .filter((name) => Object.hasOwn(FEISHU_REMOTE_TOOL_POLICY, name))
              .join(','),
          );
        },
      }),
    },
  ],
  createClient: createFeishuClient,
  validation: {
    tool: 'fetch-doc',
    accountLabel: () => 'Feishu user',
  },
};
