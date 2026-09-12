import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition } from '../../pluginDefinition';
import { createSlackClient } from './createSlackClient';
import { slackGuide } from './guide';
import { readSlackIdentity } from './slackApi';
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
      credentials:
        'https://github.com/CherryHQ/cherry-studio-app/blob/v0.2/docs/guides/slack-plugin-authorization.md',
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
      stages: ['application', 'user', 'account'],
      applicationFields: [
        { id: 'clientId', secret: false, maxLength: 256, pattern: '^\\d+\\.\\d+$' },
      ],
      createRuntime: (store) => new SlackAuthorizationRuntime(store),
      createRequestAuthorization: () => ({
        apply(credential, { headers }) {
          const parsed = SlackUserCredentialSchema.safeParse(credential);
          if (!parsed.success || parsed.data.rejected)
            throw new PluginError('authorization', 'Slack read-only authorization is unavailable.');
          headers.set('Authorization', `Bearer ${parsed.data.tokens.accessToken}`);
        },
      }),
    },
  ],
  createClient: createSlackClient,
  validation: {
    tool: 'slack_get_identity',
    args: {},
    accountLabel: (value) => readSlackIdentity(value).label,
  },
};
