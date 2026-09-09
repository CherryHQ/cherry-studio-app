import { createOfficialMcpClient } from '../createOfficialMcpClient';
import {
  createFeishuTokenProvider,
  FEISHU_CREDENTIAL_FIELDS,
  parseFeishuAppCredentials,
} from '../feishuAuthorization';
import type { PluginDefinition } from '../pluginDefinition';

export const feishuPlugin: PluginDefinition = {
  serverName: '飞书',
  catalog: {
    id: 'feishu',
    name: {
      default: 'Feishu',
      'zh-cn': '飞书',
    },
    summary: {
      default: 'Read and edit cloud documents as an application',
      'zh-cn': '以应用身份读取和编辑云文档',
    },
    description: {
      default:
        "Use Feishu's official cloud tools to read documents, browse knowledge-space nodes, create and update documents, and read and add comments. Connects as your custom application and accesses only resources shared with that application.",
      'zh-cn':
        '通过飞书官方云端工具读取文档、浏览知识空间目录、创建和更新文档、查看和添加评论。连接使用自建应用身份，仅能访问授予该应用的资源。',
    },
    access: {
      default:
        "The application secret is sent only to Feishu's official authorization endpoint; document links and content go to its official MCP service. Enable the required API scopes and share target documents or knowledge spaces with your application. This is not your personal account and does not support personal document search, calendars, or Base.",
      'zh-cn':
        '应用密钥仅发送到飞书官方授权接口，文档链接和内容发送到飞书官方 MCP 服务。需要在飞书开通相应 API 权限并授予应用目标文档或知识库访问权限。此连接不代表你的个人账号，不支持个人文档搜索、日历或多维表格。',
    },
    setup: {
      default:
        'Create and publish your own custom application on Feishu Open Platform. Follow the guide below to enable the document tool scopes and grant access to target documents or knowledge spaces. Enter its App ID and App Secret from Credentials & Basic Info; application access tokens are obtained automatically. A successful connection does not grant access to every document.',
      'zh-cn':
        '在飞书开放平台创建并发布你自己的自建应用，按下方接入指南开通云文档工具所需权限，并将目标文档或知识库授权给该应用。填写“凭证与基础信息”中的 App ID 和 App Secret；应用访问令牌将自动换取。连接成功不代表拥有所有文档的访问权限。',
    },
    credentialLinkLabel: {
      default: 'View Feishu application setup and permissions',
      'zh-cn': '查看飞书应用配置与权限指南',
    },
    icon: 'file-text',
    links: {
      credentials:
        'https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server',
      website: 'https://open.feishu.cn',
      privacy: 'https://www.feishu.cn/privacy',
    },
    credentialFields: FEISHU_CREDENTIAL_FIELDS,
  },
  tools: {
    'fetch-doc': 'read',
    'list-docs': 'read',
    'get-comments': 'read',
    'create-doc': 'write',
    'update-doc': 'write',
    'add-comments': 'write',
  },
  authMethod: 'app_credentials',
  encodeCredentials: (fields) => JSON.stringify(fields),
  createClient(context) {
    const tokens = createFeishuTokenProvider();
    return createOfficialMcpClient(context, {
      url: 'https://mcp.feishu.cn/mcp',
      authorization: {
        async apply(credential, { headers, signal }) {
          headers.set('X-Lark-MCP-TAT', await tokens.getToken(credential, signal));
          headers.set('X-Lark-MCP-Allowed-Tools', Object.keys(context.tools).join(','));
        },
        invalidate: () => tokens.invalidate(),
      },
    });
  },
  validation: {
    tool: 'fetch-doc',
    accountLabel: (_result, credential) => parseFeishuAppCredentials(credential).appId,
  },
};
