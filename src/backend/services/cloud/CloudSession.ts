import * as z from 'zod';

import { createHttpClient, type HttpClient, isHttpError } from '@/backend/services/http';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import { CloudAccessError, CloudAccountSchema } from '@/shared/contracts/cloud';

import { cloudSignatureHeaders, type CloudDevice } from './cloudDevice';
import {
  CloudGatewayRequestError,
  cloudRetryDeadline,
  readCloudGatewayCode,
} from './cloudGatewayError';

const TokenSetSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  session_id: z.string().min(1),
  expires_in: z.number().positive(),
});
type Tokens = z.infer<typeof TokenSetSchema> & { expiresAt: number; deviceId: string };
export interface CloudIdentity {
  key: string;
  profileId: string;
  apiOrigin?: string;
}
export interface CloudIdentitySource {
  getIdentity(): CloudIdentity | null;
  getTokens(key: string): Promise<{ accessToken: string; idToken: string }>;
  getGuestCatalogOrigin?(signal: AbortSignal): Promise<string>;
  refreshServices?(key: string, signal: AbortSignal): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** One identity generation. Product tokens live only here, never in SQLite or frontend state. */
export class CloudSession {
  private tokens: Tokens | undefined;
  private entering: Promise<Tokens> | undefined;
  private readonly http: HttpClient;
  private readonly retryUntil = new Map<string, number>();

  constructor(
    readonly origin: string,
    private readonly identity: CloudIdentity,
    private readonly source: CloudIdentitySource,
    private readonly device: CloudDevice,
    private readonly version: string,
    readonly signal: AbortSignal,
  ) {
    this.http = createHttpClient({
      serviceName: 'CloudSession',
      operation: 'cloud.session',
      baseUrl: origin,
      headers: defaultAppHeaders(),
      timeoutMs: 20_000,
      errorDecoder: ({ data, status }) => {
        const code = readCloudGatewayCode(data);
        return code ? { code, message: `Cloud request failed (${status}) ${code}` } : undefined;
      },
    });
  }

  assertCurrent(): void {
    this.signal.throwIfAborted();
    const current = this.source.getIdentity();
    if (current?.key !== this.identity.key || current.apiOrigin !== this.identity.apiOrigin)
      throw new CloudAccessError('signed_out');
  }

  async get(path: string): Promise<unknown> {
    return this.requestWithoutBody('GET', path);
  }

  async postEmpty(path: string): Promise<unknown> {
    return this.requestWithoutBody('POST', path);
  }

  private async requestWithoutBody(method: 'GET' | 'POST', path: string): Promise<unknown> {
    if ((this.retryUntil.get(path) ?? 0) > Date.now())
      throw new CloudGatewayRequestError(429, 'RATE_LIMITED');
    for (let attempt = 0; ; attempt++) {
      const headers = await this.headers(method, path);
      try {
        const response = await this.http.request({
          method,
          path,
          headers,
          signal: this.signal,
          redirect: 'error',
          credentials: 'omit',
          maxResponseBytes: 2 * 1024 * 1024,
        });
        this.assertCurrent();
        return response.data;
      } catch (error) {
        this.assertCurrent();
        if (!isHttpError(error)) throw error;
        if (attempt === 0 && this.recoverRequest(error.status, error.code, headers.authorization))
          continue;
        if (error.status === 429)
          this.retryUntil.set(path, cloudRetryDeadline(error.retryAfter, Date.now()));
        throw error;
      }
    }
  }

  /** A late rejection for an old access token must not invalidate an already rotated session. */
  recoverRequest(
    status: number | undefined,
    code: string | undefined,
    authorization?: string,
  ): boolean {
    if (status === 409 && code === 'REQUEST_REPLAYED') return true;
    if (
      status !== 401 ||
      (code !== 'AUTH_REQUIRED' && code !== 'SESSION_EXPIRED' && code !== 'REAUTH_REQUIRED')
    )
      return false;
    if (this.tokens && authorization === `Bearer ${this.tokens.access_token}`) {
      if (code === 'REAUTH_REQUIRED') this.tokens = undefined;
      else this.tokens.expiresAt = 0;
    }
    return true;
  }

  async headers(
    method: string,
    path: string,
    body = '',
    idempotencyKey = '',
  ): Promise<Record<string, string>> {
    const tokens = await this.ensureTokens();
    this.assertCurrent();
    return {
      ...defaultAppHeaders(),
      authorization: `Bearer ${tokens.access_token}`,
      ...cloudSignatureHeaders(this.device, tokens.deviceId, method, path, body, idempotencyKey),
    };
  }

  /** Best effort on account replacement; never refresh or reopen a closed identity. */
  async revoke(): Promise<void> {
    const tokens = this.tokens;
    this.tokens = undefined;
    if (!tokens) return;
    const path = '/api/v1/product-sessions/current';
    await this.http.request({
      method: 'DELETE',
      path,
      redirect: 'error',
      credentials: 'omit',
      timeoutMs: 5000,
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        ...cloudSignatureHeaders(this.device, tokens.deviceId, 'DELETE', path),
      },
    });
  }

  private async ensureTokens(): Promise<Tokens> {
    this.assertCurrent();
    if (this.tokens && this.tokens.expiresAt > Date.now() + 60_000) return this.tokens;
    this.entering ??= this.enterOrRefresh().finally(() => {
      this.entering = undefined;
    });
    return this.entering;
  }

  private async enterOrRefresh(): Promise<Tokens> {
    const previous = this.tokens;
    if (previous) {
      const path = '/api/v1/product-sessions/refresh';
      const body = JSON.stringify({
        session_id: previous.session_id,
        refresh_token: previous.refresh_token,
      });
      try {
        const response = await this.http.request({
          method: 'POST',
          path,
          body,
          signal: this.signal,
          redirect: 'error',
          credentials: 'omit',
          headers: {
            'content-type': 'application/json',
            ...cloudSignatureHeaders(this.device, previous.deviceId, 'POST', path, body),
          },
          maxResponseBytes: 1024 * 1024,
        });
        this.assertCurrent();
        const { token_set } = z.object({ token_set: TokenSetSchema }).parse(response.data);
        return (this.tokens = {
          ...token_set,
          deviceId: previous.deviceId,
          expiresAt: Date.now() + token_set.expires_in * 1000,
        });
      } catch (error) {
        this.assertCurrent();
        // A lost refresh response may have rotated its token; fall back to device entry on 401.
        this.tokens = undefined;
        if (!isHttpError(error) || error.status !== 401 || error.code === 'ACCOUNT_DISABLED')
          throw error;
      }
    }
    const pair = await this.source.getTokens(this.identity.key);
    this.assertCurrent();
    const response = await this.http.request({
      method: 'POST',
      path: '/accounts-portal/v1/enter',
      signal: this.signal,
      redirect: 'error',
      credentials: 'omit',
      headers: { authorization: `Bearer ${pair.accessToken}`, 'content-type': 'application/json' },
      body: {
        id_token: pair.idToken,
        profile: this.identity.profileId,
        device_public_key: this.device.publicKey,
        machine_code: this.device.machineCode,
        platform: this.device.platform,
        client_version: this.version,
      },
      maxResponseBytes: 2 * 1024 * 1024,
    });
    this.assertCurrent();
    const entry = z
      .object({ token_set: TokenSetSchema, account: CloudAccountSchema })
      .parse(response.data);
    if (entry.account.account.id !== this.identity.profileId)
      throw new CloudAccessError('unavailable');
    return (this.tokens = {
      ...entry.token_set,
      deviceId: entry.account.device.id,
      expiresAt: Date.now() + entry.token_set.expires_in * 1000,
    });
  }
}
