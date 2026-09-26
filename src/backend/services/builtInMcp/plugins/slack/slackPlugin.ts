import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { slackGuide } from './guide';
import { SLACK_USER_TOKEN_PATTERN, SlackTokenCredentialSchema } from './slackCredentials';
import { getSlackApplicationSetupUrl } from './slackSetup';
import { SLACK_TOOL_POLICY } from './slackTools';

export const slackPlugin: PluginDefinition = {
  serverName: 'Slack',
  guide: slackGuide,
  catalog: {
    id: 'slack',
    icon: 'file-text',
    links: {
      credentials: getSlackApplicationSetupUrl(),
      website: 'https://slack.com',
      privacy: 'https://slack.com/trust/privacy/privacy-policy',
      authorizationManagement: 'https://slack.com/apps/manage',
    },
  },
  tools: SLACK_TOOL_POLICY,
  authMethods: [
    {
      id: 'personal_token',
      kind: 'credentials',
      requiresDisconnect: true,
      fields: [{ id: 'token', secret: true, maxLength: 16_384, pattern: SLACK_USER_TOKEN_PATTERN }],
      encodeCredentials: (fields) => ({ version: 1, token: fields.token }),
      createRequestAuthorization: () => ({
        apply(credential, { headers }) {
          const parsed = SlackTokenCredentialSchema.safeParse(credential);
          if (!parsed.success)
            throw new PluginError(
              'authorization',
              'Enter a Slack user token beginning with xoxp-.',
            );
          headers.set('Authorization', `Bearer ${parsed.data.token}`);
        },
      }),
    },
  ],
  createClient: (context) => createOfficialMcpClient(context, { url: 'https://mcp.slack.com/mcp' }),
  // Validate service access without reading workspace content; token replacement requires disconnect.
  validation: { tool: 'slack_read_user_profile', accountLabel: () => 'Official MCP' },
};
