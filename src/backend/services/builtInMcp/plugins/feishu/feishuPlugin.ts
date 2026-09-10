import type { PluginDefinition } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { FeishuAuthorizationRuntime } from './FeishuAuthorizationRuntime';
import { FEISHU_CREDENTIAL_FIELDS, FeishuUserCredentialSchema } from './feishuCredentials';

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
  tools: {
    'fetch-doc': 'read',
    'list-docs': 'read',
    'get-comments': 'read',
    'create-doc': 'write',
    'update-doc': 'write',
    'add-comments': 'write',
  },
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
          headers.set('X-Lark-MCP-Allowed-Tools', Object.keys(tools).join(','));
        },
      }),
    },
  ],
  createClient(context) {
    return createOfficialMcpClient(context, {
      url: 'https://mcp.feishu.cn/mcp',
    });
  },
  validation: {
    tool: 'fetch-doc',
    accountLabel: () => 'Feishu user',
  },
};
