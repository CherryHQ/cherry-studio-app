import * as z from 'zod';

import { createHttpClient, type HttpClient, isHttpError } from '@/backend/services/http';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import { CloudAccessError, CloudAccountSchema } from '@/shared/contracts/cloud';

import { cloudSignatureHeaders, type CloudDevice } from './cloudDevice';

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
}
export interface CloudIdentitySource {
  getIdentity(): CloudIdentity | null;
  getTokens(key: string): Promise<{ accessToken: string; idToken: string }>;
  subscribe(listener: () => void): () => void;
}

/** One identity generation. Product tokens live only here, never in SQLite or frontend state. */
export class CloudSession {
  private tokens: Tokens | undefined;
  private entering: Promise<Tokens> | undefined;
  private readonly http: HttpClient;

  constructor(
    readonly origin: string,
    private readonly identity: CloudIdentity,
    private readonly source: CloudIdentitySource,
    private readonly device: CloudDevice,
    private readonly version: string,
    readonly signal: AbortSignal,
  ) {
    this.http = createHttpClient({
      baseUrl: origin,
      headers: defaultAppHeaders(),
      timeoutMs: 20_000,
    });
  }

  assertCurrent(): void {
    this.signal.throwIfAborted();
    if (this.source.getIdentity()?.key !== this.identity.key)
      throw new CloudAccessError('signed_out');
  }

  async get(path: string): Promise<unknown> {
    const headers = await this.headers('GET', path);
    try {
      const response = await this.http.request({
        method: 'GET',
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
      if (isHttpError(error) && error.status === 401) this.tokens = undefined;
      throw error;
    }
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

  invalidate(): void {
    this.tokens = undefined;
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
        // A lost refresh response may have rotated its token; the next attempt enters afresh.
        this.tokens = undefined;
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
