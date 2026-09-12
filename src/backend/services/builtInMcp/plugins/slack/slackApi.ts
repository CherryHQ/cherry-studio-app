import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

const api = createHttpClient({ baseUrl: 'https://slack.com', timeoutMs: 30_000 });
const EnvelopeSchema = z.object({ ok: z.boolean(), error: z.string().optional() });
const AUTH_ERRORS = new Set([
  'invalid_auth',
  'not_authed',
  'token_expired',
  'token_revoked',
  'account_inactive',
  'invalid_refresh_token',
  'invalid_grant',
]);
const ACCESS_ERRORS = new Set([
  'missing_scope',
  'not_allowed_token_type',
  'access_denied',
  'team_access_not_granted',
  'not_in_channel',
  'channel_not_found',
  'enterprise_is_restricted',
  'org_login_required',
]);

/** All calls use reviewed Slack methods, and upstream messages never become application errors. */
export async function slackRequest(
  method: string,
  fields: Record<string, string>,
  signal: AbortSignal,
  token?: string,
): Promise<unknown> {
  try {
    const response = await api.request<unknown>({
      method: 'POST',
      path: `/api/${method}`,
      signal,
      redirect: 'error',
      maxResponseBytes: 2_000_000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: new URLSearchParams(fields).toString(),
    });
    const envelope = EnvelopeSchema.safeParse(response.data);
    if (!envelope.success) throw new PluginError('request', 'Slack returned an invalid response.');
    if (!envelope.data.ok) {
      const code = envelope.data.error ?? '';
      if (AUTH_ERRORS.has(code))
        throw new PluginError('authorization', 'Reconnect your Slack account.');
      if (code === 'ratelimited')
        throw new PluginError('quota', 'Slack request limit reached. Wait before retrying.');
      if (ACCESS_ERRORS.has(code))
        throw new PluginError(
          'access',
          'Slack denied access. Check user scopes, channel membership and workspace policy.',
        );
      throw new PluginError(
        'request',
        'Slack rejected the request. Check the application settings and arguments.',
      );
    }
    return response.data;
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'Slack request cancelled.');
    if (error instanceof PluginError) throw error;
    if (isHttpError(error)) {
      if (error.status === 401)
        throw new PluginError('authorization', 'Reconnect your Slack account.');
      if (error.status === 403) throw new PluginError('access', 'Slack denied access.');
      if (error.status === 429)
        throw new PluginError('quota', 'Slack request limit reached. Wait before retrying.');
      if (error.kind === 'invalid_response' || (error.status && error.status < 500))
        throw new PluginError(
          'request',
          'Slack rejected the request or returned too much data. Narrow the query.',
        );
    }
    throw new PluginError('network', 'Could not reach Slack.');
  }
}

export function readSlackIdentity(value: unknown) {
  const parsed = z
    .object({
      team_id: z.string().regex(/^[A-Z0-9]+$/),
      user_id: z.string().regex(/^[A-Z0-9]+$/),
      team: z.string().min(1).max(200),
      user: z.string().min(1).max(200),
    })
    .safeParse(value);
  if (!parsed.success)
    throw new PluginError('request', 'Slack did not return a workspace and user identity.');
  const account = parsed.data;
  return {
    id: `${account.team_id}:${account.user_id}`,
    label: `${account.team} · ${account.user}`,
  };
}
