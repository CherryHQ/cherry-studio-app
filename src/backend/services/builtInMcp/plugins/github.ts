import * as z from 'zod';

import { createOfficialMcpClient } from '../createOfficialMcpClient';
import type { PluginDefinition } from '../pluginDefinition';

export const githubPlugin: PluginDefinition = {
  catalog: {
    id: 'github',
    name: {
      default: 'GitHub',
      'zh-cn': 'GitHub',
    },
    summary: {
      default: 'Explore code, issues, and pull requests',
      'zh-cn': '查看代码，跟进 Issue 和 PR',
    },
    description: {
      default:
        "Use GitHub's official cloud tools to search repositories, issues and pull requests, read files, create or update issues, publish comments, and open pull requests from existing branches.",
      'zh-cn':
        '通过 GitHub 官方云端工具搜索仓库、Issue 和 PR，读取文件，创建或更新 Issue、发表评论，以及从现有分支发起 PR。',
    },
    access: {
      default:
        'Accessible repositories and actions depend on your token permissions. Organization repositories may also require administrator approval.',
      'zh-cn': '可访问的仓库和操作取决于你授予令牌的权限。组织仓库可能还需要管理员批准。',
    },
    setup: {
      default:
        'Create a fine-grained personal access token and select repositories. The link pre-fills a one-year expiry, Contents read, and Issues and Pull requests write permissions. Use read-only permissions if you only query.',
      'zh-cn':
        '创建细粒度个人访问令牌，选择可访问的仓库。下方链接已预填一年有效期、Contents 读取及 Issues、Pull requests 读写权限；只查询时可改为只读。',
    },
    credentialLinkLabel: {
      default: 'Create a token on GitHub',
      'zh-cn': '在 GitHub 创建令牌',
    },
    icon: 'github',
    links: {
      credentials:
        'https://github.com/settings/personal-access-tokens/new?name=Cherry%20Studio&description=Cherry%20Studio%20plugin&expires_in=366&contents=read&issues=write&pull_requests=write',
      website: 'https://github.com',
      privacy:
        'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
    },
    credentialFields: [
      {
        id: 'token',
        label: {
          default: 'Personal access token',
          'zh-cn': '个人访问令牌',
        },
        error: {
          default: 'Enter a complete credential without spaces or line breaks',
          'zh-cn': '请输入完整的密钥，不要包含空格或换行',
        },
        secret: true,
        maxLength: 4096,
        pattern: '^\\S+$',
      },
    ],
  },
  tools: {
    get_me: 'read',
    search_repositories: 'read',
    search_issues: 'read',
    search_pull_requests: 'read',
    get_file_contents: 'read',
    list_pull_requests: 'read',
    issue_read: 'read',
    pull_request_read: 'read',
    issue_write: 'write',
    add_issue_comment: 'write',
    create_pull_request: 'write',
  },
  authMethod: 'personal_token',
  encodeCredentials: (fields) => fields.token,
  createClient(context) {
    return createOfficialMcpClient(context, {
      url: 'https://api.githubcopilot.com/mcp/',
      authorization: {
        apply(credential, { headers }) {
          headers.set('Authorization', `Bearer ${credential}`);
          headers.set('X-MCP-Tools', Object.keys(context.tools).join(','));
        },
      },
    });
  },
  validation: {
    tool: 'get_me',
    args: {},
    accountLabel: (result) => z.object({ login: z.string().min(1).max(100) }).parse(result).login,
  },
};
