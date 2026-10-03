import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { SlackTokenCredentialSchema } from '../slackCredentials';
import { slackPlugin } from '../slackPlugin';

const method = slackPlugin.authMethods[0];
if (method.kind !== 'credentials') throw new Error('Expected user-token entry');
const fieldsSchema = createPluginCredentialsSchema(method.fields);

it('trims and encodes a user token without app credentials or callback state', async () => {
  const fields = fieldsSchema.parse({ token: '  xoxp-private-user-token  ' });
  const credential = method.encodeCredentials(fields);
  expect(credential).toEqual({ version: 1, token: 'xoxp-private-user-token' });
  const headers = new Headers();
  await method.createRequestAuthorization(slackPlugin.tools).apply(credential, {
    url: new URL('https://mcp.slack.com/mcp'),
    headers,
  });
  expect(headers.get('Authorization')).toBe('Bearer xoxp-private-user-token');
});

it.each([
  ['empty', ''],
  ['missing secret', 'xoxp-'],
  ['bot', 'xoxb-bot-token'],
  ['app-level', 'xapp-app-token'],
  ['rotating', 'xoxe.xoxp-rotating-token'],
  ['refresh', 'xoxe-refresh-token'],
  ['session', 'xoxc-session-token'],
  ['whitespace', 'xoxp-invalid token'],
  ['oversized', 'xoxp-' + 'a'.repeat(16_384)],
])('rejects %s tokens before sending them', async (_label, token) => {
  expect(fieldsSchema.safeParse({ token }).success).toBe(false);
  expect(SlackTokenCredentialSchema.safeParse({ version: 1, token }).success).toBe(false);
  const headers = new Headers();
  await expect(
    Promise.resolve().then(() =>
      method
        .createRequestAuthorization(slackPlugin.tools)
        .apply({ version: 1, token }, { url: new URL('https://mcp.slack.com/mcp'), headers }),
    ),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(headers.has('Authorization')).toBe(false);
});

it('does not reinterpret an older OAuth token bundle as a manual token', () => {
  expect(
    SlackTokenCredentialSchema.safeParse({
      version: 1,
      application: { version: 1, clientId: '123.456' },
      tokens: { accessToken: 'xoxp-old-user-token', refreshToken: 'old-refresh' },
    }).success,
  ).toBe(false);
});
