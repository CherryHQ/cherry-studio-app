import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { slackGuide } from './guide';
import { SlackAuthorizationRuntime } from './SlackAuthorizationRuntime';
import { SlackUserCredentialSchema } from './slackCredentials';
import { SLACK_TOOL_POLICY } from './slackTools';

export const slackPlugin: PluginDefinition = {
  serverName: 'Slack',
  guide: slackGuide,
  catalog: {
    id: 'slack',
    icon: 'file-text',
    links: {
      credentials: 'https://slack.com/apps/manage',
      website: 'https://slack.com',
      privacy: 'https://slack.com/trust/privacy/privacy-policy',
      authorizationManagement: 'https://slack.com/apps/manage',
    },
  },
  tools: SLACK_TOOL_POLICY,
  authMethods: [
    {
      id: 'slack_user',
      kind: 'interactive',
      interaction: 'callback',
      stages: ['user'],
      createRuntime: (store) => new SlackAuthorizationRuntime(store),
      createRequestAuthorization: () => ({
        apply(credential, { headers }) {
          const parsed = SlackUserCredentialSchema.safeParse(credential);
          if (!parsed.success || parsed.data.rejected)
            throw new PluginError('authorization', 'Slack authorization is unavailable.');
          headers.set('Authorization', `Bearer ${parsed.data.tokens.accessToken}`);
        },
      }),
    },
  ],
  createClient: (context) => createOfficialMcpClient(context, { url: 'https://mcp.slack.com/mcp' }),
  // OAuth binds the workspace and user; setup only discovers this read tool, without calling it.
  validation: { tool: 'slack_read_user_profile', accountLabel: () => 'Official MCP' },
};
