import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition } from '../../pluginDefinition';
import { createGmailClient } from './createGmailClient';
import { GmailAuthorizationRuntime } from './GmailAuthorizationRuntime';
import { GmailUserCredentialSchema } from './gmailCredentials';
import { GMAIL_TOOL_POLICY } from './gmailTools';
import { gmailGuide } from './guide';

export const gmailPlugin: PluginDefinition = {
  serverName: 'Gmail',
  guide: gmailGuide,
  catalog: {
    id: 'gmail',
    icon: 'file-text',
    links: {
      credentials: 'https://myaccount.google.com/permissions',
      website: 'https://mail.google.com',
      privacy: 'https://policies.google.com/privacy',
      authorizationManagement: 'https://myaccount.google.com/permissions',
    },
  },
  tools: GMAIL_TOOL_POLICY,
  authMethods: [
    {
      id: 'gmail_user',
      kind: 'interactive',
      interaction: 'native',
      stages: ['user', 'account'],
      createRuntime: (store) => new GmailAuthorizationRuntime(store),
      createRequestAuthorization: () => ({
        apply(credential, { headers }) {
          const parsed = GmailUserCredentialSchema.safeParse(credential);
          if (!parsed.success || parsed.data.rejected)
            throw new PluginError('authorization', 'Gmail read-only authorization is unavailable.');
          headers.set('Authorization', `Bearer ${parsed.data.tokens.accessToken}`);
        },
      }),
    },
  ],
  createClient: createGmailClient,
  validation: {
    tool: 'gmail_get_profile',
    args: {},
    accountLabel: (value) =>
      z.object({ emailAddress: z.email().max(320) }).parse(value).emailAddress,
  },
};
