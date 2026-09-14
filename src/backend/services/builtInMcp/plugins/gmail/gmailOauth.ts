import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError, type PluginErrorReason } from '@/shared/contracts/plugins';

import {
  getGmailAuthorization,
  type GmailAuthorizationModule,
} from '../../../../../../modules/gmail-authorization';
import { GMAIL_READ_SCOPE, GmailTokensSchema, type GmailTokens } from './gmailCredentials';

const api = createHttpClient({ baseUrl: 'https://gmail.googleapis.com', timeoutMs: 15_000 });
// Google Sign-In on iOS includes basic identity scopes in addition to Gmail access.
const ALLOWED_SCOPES = new Set([
  GMAIL_READ_SCOPE,
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]);
const NativeAuthorizationSchema = z.object({
  accessToken: GmailTokensSchema.shape.accessToken,
  grantedScopes: z.array(z.string().max(256)).min(1).max(16),
});
const NATIVE_ERROR_REASONS: Record<string, PluginErrorReason> = {
  E_GMAIL_CANCELLED: 'cancelled',
  E_GMAIL_AUTHORIZATION: 'authorization',
  E_GMAIL_UNAVAILABLE: 'unavailable',
  E_GMAIL_BUSY: 'unavailable',
  E_GMAIL_NETWORK: 'network',
  E_GMAIL_STORAGE: 'storage',
};

function safeError(error: unknown, signal: AbortSignal): PluginError {
  if (signal.aborted) return new PluginError('cancelled', 'Gmail authorization cancelled.');
  if (error instanceof PluginError) return error;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (typeof error.code === 'string' && Object.hasOwn(NATIVE_ERROR_REASONS, error.code))
      return new PluginError(
        NATIVE_ERROR_REASONS[error.code],
        'Google authorization could not complete.',
      );
  }
  if (isHttpError(error)) {
    if (error.status === 401)
      return new PluginError('authorization', 'Reconnect your Gmail account.');
    if (error.status === 403) return new PluginError('access', 'Google denied Gmail access.');
    if (error.status === 429) return new PluginError('quota', 'Google authorization rate limited.');
    if (error.status && error.status < 500)
      return new PluginError('request', 'Google rejected the Gmail request.');
  }
  return new PluginError('network', 'Could not reach Google authorization.');
}

async function nativeCall<T>(
  operation: (native: GmailAuthorizationModule) => Promise<T>,
  signal: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  try {
    signal.throwIfAborted();
    const native = getGmailAuthorization();
    if (!native)
      throw new PluginError('unavailable', 'This build does not include Gmail authorization.');
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    // SDK dialogs own their dismissal. Aborting our wait prevents late results from committing.
    return await new Promise<T>((resolve, reject) => {
      const abort = () =>
        reject(
          new PluginError(
            signal.aborted ? 'cancelled' : 'network',
            'Google authorization was cancelled or timed out.',
          ),
        );
      deadline.addEventListener('abort', abort, { once: true });
      operation(native)
        .then(resolve, reject)
        .finally(() => deadline.removeEventListener('abort', abort));
    });
  } catch (error) {
    throw safeError(error, signal);
  }
}

export const gmailOauth = {
  async authorize(
    email: string | null,
    interactive: boolean,
    signal: AbortSignal,
  ): Promise<GmailTokens> {
    const result = await nativeCall(
      (native) => native.authorize(email, interactive),
      signal,
      interactive ? 10 * 60_000 : 15_000,
    );
    signal.throwIfAborted();
    const parsed = NativeAuthorizationSchema.safeParse(result);
    if (!parsed.success) throw new PluginError('request', 'Invalid Google authorization result.');
    const { accessToken, grantedScopes } = parsed.data;
    if (
      !grantedScopes.includes(GMAIL_READ_SCOPE) ||
      grantedScopes.some((scope) => !ALLOWED_SCOPES.has(scope))
    )
      throw new PluginError('access', 'Gmail requires a read-only authorization.');
    return { accessToken, scope: GMAIL_READ_SCOPE };
  },
  async getAccount(token: string, signal: AbortSignal) {
    try {
      const response = await api.request<unknown>({
        method: 'GET',
        path: '/gmail/v1/users/me/profile',
        signal,
        redirect: 'error',
        maxResponseBytes: 65_536,
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = z.object({ emailAddress: z.email().max(320) }).safeParse(response.data);
      if (!parsed.success)
        throw new PluginError('request', 'Gmail did not return an account identity.');
      return { id: parsed.data.emailAddress.toLowerCase(), label: parsed.data.emailAddress };
    } catch (error) {
      throw safeError(error, signal);
    }
  },
  revoke(email: string, signal: AbortSignal) {
    return nativeCall((native) => native.revoke(email), signal);
  },
  clearToken(token: string, signal: AbortSignal) {
    return nativeCall((native) => native.clearToken(token), signal);
  },
};
