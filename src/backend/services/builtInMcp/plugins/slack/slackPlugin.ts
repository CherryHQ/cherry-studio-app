import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition } from '../../pluginDefinition';
import { createSlackClient } from './createSlackClient';
import { slackGuide } from './guide';
import { readSlackIdentity } from './slackApi';
import { SlackAuthorizationRuntime } from './SlackAuthorizationRuntime';
import {
  SLACK_READ_SCOPES,
  SlackApplicationSchema,
  SlackUserCredentialSchema,
} from './slackCredentials';
import { getSlackApplicationSetupUrl } from './slackOauth';
import { SLACK_TOOL_POLICY } from './slackTools';

export const slackPlugin: PluginDefinition = {
  serverName: 'Slack',
  guide: slackGuide,
  catalog: {
    id: 'slack',
    icon: 'file-text',
    links: {
      credentials: 'https://api.slack.com/apps',
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
      stages: ['application', 'user'],
      applicationFields: [
        { id: 'clientId', secret: false, maxLength: 256, pattern: '^\\d+\\.\\d+$' },
      ],
      applicationSetup: {
        createUrl: getSlackApplicationSetupUrl(),
        redirectUrls: SlackApplicationSchema.shape.redirectUrl.options,
        scopes: SLACK_READ_SCOPES,
      },
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
