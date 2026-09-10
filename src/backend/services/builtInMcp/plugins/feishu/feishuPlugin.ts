import type { PluginDefinition } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { createFeishuAppTokenProvider } from './feishuAppToken';
import { FeishuAuthorizationRuntime } from './FeishuAuthorizationRuntime';
import {
  FEISHU_CREDENTIAL_FIELDS,
  parseFeishuAppCredentials,
  FeishuUserCredentialSchema,
} from './feishuCredentials';

export const feishuPlugin: PluginDefinition = {
  serverName: '飞书',
  catalog: {
    id: 'feishu',
    icon: 'file-text',
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
      stages: ['registration', 'user'],
      applicationFields: FEISHU_CREDENTIAL_FIELDS,
      createRuntime: (store) => new FeishuAuthorizationRuntime(store),
      createRequestAuthorization: (tools) => ({
        apply(credential, { headers }) {
          const { tokens } = FeishuUserCredentialSchema.parse(credential);
          headers.delete('X-Lark-MCP-TAT');
          headers.set('X-Lark-MCP-UAT', tokens.accessToken);
          headers.set('X-Lark-MCP-Allowed-Tools', Object.keys(tools).join(','));
        },
      }),
    },
    {
      id: 'app_credentials',
      kind: 'credentials',
      fields: FEISHU_CREDENTIAL_FIELDS,
      encodeCredentials: (fields) => ({ version: 1, ...fields }),
      createRequestAuthorization(tools) {
        const tokens = createFeishuAppTokenProvider();
        return {
          async apply(credential, { headers, signal }) {
            headers.delete('X-Lark-MCP-UAT');
            headers.set('X-Lark-MCP-TAT', await tokens.getToken(credential, signal));
            headers.set('X-Lark-MCP-Allowed-Tools', Object.keys(tools).join(','));
          },
          invalidate: () => tokens.invalidate(),
        };
      },
    },
  ],
  createClient(context) {
    return createOfficialMcpClient(context, {
      url: 'https://mcp.feishu.cn/mcp',
    });
  },
  validation: {
    tool: 'fetch-doc',
    accountLabel: (_result, credential) =>
      FeishuUserCredentialSchema.safeParse(credential).success
        ? 'Feishu user'
        : parseFeishuAppCredentials(credential).appId,
  },
};
