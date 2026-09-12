import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import { readSlackIdentity, slackRequest } from './slackApi';
import {
  SLACK_READ_SCOPES,
  SlackApplicationSchema,
  SlackScopeSchema,
  type SlackApplication,
  type SlackTokens,
} from './slackCredentials';

const TokenSchema = z.object({
  access_token: z.string().min(1).max(16_384).regex(/^\S+$/),
  refresh_token: z.string().min(1).max(16_384).regex(/^\S+$/),
  token_type: z.literal('user'),
  expires_in: z.number().int().positive(),
  scope: SlackScopeSchema,
});
async function exchange(
  application: SlackApplication,
  fields: Record<string, string>,
  signal: AbortSignal,
): Promise<SlackTokens> {
  const startedAt = Date.now();
  const value = await slackRequest(
    'oauth.v2.access',
    { ...fields, client_id: application.clientId },
    signal,
  );
  // Authorization responses nest user tokens; refresh responses may return them at the top level.
  const envelope = z.object({ authed_user: z.unknown().optional() }).parse(value);
  const parsed = TokenSchema.safeParse(envelope.authed_user ?? value);
  if (!parsed.success)
    throw new PluginError(
      'access',
      'Slack must grant rotating user tokens with exactly the configured read-only scopes.',
    );
  const token = parsed.data;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    scope: token.scope,
    expiresAt: startedAt + token.expires_in * 1000,
    refreshExpiresAt: startedAt + 30 * 24 * 60 * 60_000,
  };
}
const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

export const slackOauth = {
  application(fields: Record<string, string>): SlackApplication {
    const schemes = Constants.expoConfig?.scheme;
    const scheme = Array.isArray(schemes) ? schemes[0] : schemes;
    const parsed = SlackApplicationSchema.safeParse({
      version: 1,
      clientId: fields.clientId,
      redirectUrl: `${scheme}://plugins/slack/callback`,
    });
    if (!parsed.success)
      throw new PluginError('request', 'Enter your Slack application client ID and enable PKCE.');
    return parsed.data;
  },
  async challenge(application: SlackApplication) {
    const state = randomValue();
    const verifier = randomValue();
    const challenge = base64Url(
      await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: CryptoEncoding.BASE64,
      }),
    );
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.search = new URLSearchParams({
      client_id: application.clientId,
      redirect_uri: application.redirectUrl,
      scope: '',
      user_scope: SLACK_READ_SCOPES.join(','),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return { state, verifier, authorizationUrl: url.href };
  },
  exchangeCode(application: SlackApplication, code: string, verifier: string, signal: AbortSignal) {
    return exchange(
      application,
      { code, code_verifier: verifier, redirect_uri: application.redirectUrl },
      signal,
    );
  },
  refresh(application: SlackApplication, tokens: SlackTokens, signal: AbortSignal) {
    return exchange(
      application,
      { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
      signal,
    );
  },
  async getAccount(token: string, signal: AbortSignal) {
    return readSlackIdentity(await slackRequest('auth.test', {}, signal, token));
  },
  async revoke(token: string, signal: AbortSignal) {
    await slackRequest('auth.revoke', {}, signal, token);
  },
};
