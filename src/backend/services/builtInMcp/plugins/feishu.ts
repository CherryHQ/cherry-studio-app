import { PluginError } from '@/shared/contracts/plugins';

import { createOfficialMcpClient } from '../createOfficialMcpClient';
import {
  createFeishuTokenProvider,
  FEISHU_CREDENTIAL_FIELDS,
  isFeishuUserCredential,
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
      default: 'Connect your Feishu account to read and edit cloud documents',
      'zh-cn': '连接飞书账号，读取和编辑云文档',
    },
    description: {
      default:
        "Use Feishu's official cloud tools to read documents, browse knowledge-space nodes, create and update documents, and read and add comments. Authorize your account in Feishu without copying application credentials. Existing application-identity connections remain supported.",
      'zh-cn':
        '通过飞书官方云端工具读取文档、浏览知识空间目录、创建和更新文档、查看和添加评论。在飞书确认账号授权，无需复制应用凭证；也保留已有应用身份的接入方式。',
    },
    access: {
      default:
        "Browser authorization stores application secrets and user tokens in this device's secure storage. Credentials go only to official Feishu services; document links and content go to its official MCP service. Your document access and organization approval rules still apply. This plugin does not provide document search, calendars, or Base.",
      'zh-cn':
        '浏览器授权取得的应用密钥和用户令牌保存在本机系统安全存储中，凭证仅发送到飞书官方服务。文档链接和内容发送到飞书官方 MCP 服务，仍受你的文档权限及企业审批规则约束。此插件暂不提供文档搜索、日历或多维表格工具。',
    },
    setup: {
      default:
        'First confirm application setup on Feishu, then authorize document access. Return to Cherry after each confirmation. Feishu may show its CLI setup page and require administrator approval. This flow supports Feishu accounts, not international Lark accounts. A successful connection does not grant access to every document.',
      'zh-cn':
        '先在飞书确认应用设置，再授权文档访问，每次确认后返回 Cherry。飞书可能显示 CLI 应用配置页面，并要求管理员审批。目前仅支持飞书账号，不支持国际版 Lark。连接成功不代表拥有所有文档的访问权限。',
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
    interactiveAuthorization: 'feishu-device',
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
  additionalAuthMethods: ['feishu_user'],
  encodeCredentials: (fields) => JSON.stringify(fields),
  createClient(context) {
    const tokens = createFeishuTokenProvider();
    return createOfficialMcpClient(context, {
      url: 'https://mcp.feishu.cn/mcp',
      authorization: {
        async apply(credential, { headers, signal }) {
          if (isFeishuUserCredential(credential)) {
            if (!context.getUserToken)
              throw new PluginError('authorization', 'Feishu user authorization is unavailable.');
            headers.delete('X-Lark-MCP-TAT');
            headers.set('X-Lark-MCP-UAT', await context.getUserToken(credential, signal));
          } else {
            headers.delete('X-Lark-MCP-UAT');
            headers.set('X-Lark-MCP-TAT', await tokens.getToken(credential, signal));
          }
          headers.set('X-Lark-MCP-Allowed-Tools', Object.keys(context.tools).join(','));
        },
        invalidate: () => tokens.invalidate(),
      },
    });
  },
  validation: {
    tool: 'fetch-doc',
    accountLabel: (_result, credential) =>
      isFeishuUserCredential(credential)
        ? 'Feishu user'
        : parseFeishuAppCredentials(credential).appId,
  },
};
