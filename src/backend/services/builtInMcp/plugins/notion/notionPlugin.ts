import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { notionGuide } from './guide';
import { NotionAuthorizationRuntime } from './NotionAuthorizationRuntime';
import { NotionUserCredentialSchema } from './notionCredentials';
import { parseNotionSelf } from './notionSelf';

export const notionPlugin: PluginDefinition = {
  serverName: 'Notion',
  guide: notionGuide,
  catalog: {
    id: 'notion',
    icon: 'file-text',
    links: {
      credentials: 'https://www.notion.com/help/notion-mcp',
      website: 'https://www.notion.com',
      privacy: 'https://www.notion.com/privacy',
      authorizationManagement: 'https://www.notion.so/profile/connections',
    },
  },
  tools: {
    'notion-fetch': 'read',
    'notion-search': 'read',
    'notion-ai-search': 'read',
    'notion-query-data-sources': 'read',
    'notion-get-comments': 'read',
    'notion-create-pages': 'write',
    'notion-update-page': 'write',
    'notion-create-comment': 'write',
  },
  authMethods: [
    {
      id: 'notion_user',
      kind: 'interactive',
      interaction: 'callback',
      stages: ['user', 'account'],
      createRuntime: (store) => new NotionAuthorizationRuntime(store),
      createRequestAuthorization: () => ({
        apply(credential, { headers }) {
          const parsed = NotionUserCredentialSchema.safeParse(credential);
          if (!parsed.success || parsed.data.rejected)
            throw new PluginError('authorization', 'Reconnect Notion to authorize this workspace.');
          headers.set('Authorization', `Bearer ${parsed.data.tokens.accessToken}`);
        },
      }),
    },
  ],
  createClient: (context) =>
    createOfficialMcpClient(context, { url: 'https://mcp.notion.com/mcp' }),
  validation: {
    tool: 'notion-fetch',
    args: { id: 'self' },
    accountLabel: (value) => parseNotionSelf(value).label,
  },
};
