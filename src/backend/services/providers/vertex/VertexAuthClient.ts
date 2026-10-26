import * as z from 'zod';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { createHttpClient, HttpError, type HttpClient } from '@/backend/services/http';
import { sha256HexOfText } from '@/shared/utils/sha256';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

const GoogleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  token_type: z.string().optional(),
});

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

export type VertexAuthInput = {
  providerId: string;
  projectId: string;
  serviceAccount: {
    clientEmail: string;
    privateKey: string;
  };
};

type TokenRequest = {
  providerId: string;
  controller: AbortController;
  promise: Promise<CachedToken>;
  waiters: number;
};
type TokenEntry = { fingerprint: string; token?: CachedToken; request?: TokenRequest };

/** One application generation owns tokens; neither Pi's working copy nor provider rows store them. */
@Injectable('VertexAuthClient')
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class VertexAuthClient extends BaseService {
  private readonly cache = new Map<string, TokenEntry>();
  private readonly active = new Set<TokenRequest>();
  private stopped = false;
  private readonly http: HttpClient;

  constructor(
    private readonly dependencies: {
      http?: HttpClient;
      now?: () => number;
      sign?: typeof createServiceAccountAssertion;
    } = {},
  ) {
    super();
    this.http = dependencies.http ?? createHttpClient({ baseUrl: 'https://oauth2.googleapis.com' });
  }

  async getAuthorizationHeaders(
    input: VertexAuthInput,
    signal?: AbortSignal,
  ): Promise<Record<string, string>> {
    const token = await this.getToken(input, signal);
    return { Authorization: `Bearer ${token.accessToken}` };
  }

  forget(providerId: string): void {
    this.cache.delete(providerId);
    for (const request of this.active) {
      if (request.providerId === providerId) request.controller.abort();
    }
  }

  protected override async onStop(): Promise<void> {
    this.stopped = true;
    this.cache.clear();
    for (const request of this.active) request.controller.abort();
    await Promise.allSettled([...this.active].map((request) => request.promise));
  }

  private async getToken(input: VertexAuthInput, signal?: AbortSignal): Promise<CachedToken> {
    if (this.stopped || signal?.aborted) throw cancelled();
    const now = this.dependencies.now?.() ?? Date.now();
    const fingerprint = sha256HexOfText(JSON.stringify([input.projectId, input.serviceAccount]));
    let entry = this.cache.get(input.providerId);
    if (!entry || entry.fingerprint !== fingerprint) {
      entry = { fingerprint };
      this.cache.set(input.providerId, entry);
    }
    if (entry.token && now < entry.token.expiresAt - TOKEN_EXPIRY_BUFFER_MS) return entry.token;

    let request = entry.request;
    if (!request) {
      const owner = entry;
      const controller = new AbortController();
      const pending: TokenRequest = {
        providerId: input.providerId,
        controller,
        waiters: 0,
        promise: this.requestToken(input, now, controller.signal),
      };
      pending.promise = pending.promise
        .then((token) => {
          if (!controller.signal.aborted && this.cache.get(input.providerId) === owner)
            owner.token = token;
          return token;
        })
        .finally(() => {
          this.active.delete(pending);
          if (owner.request === pending) owner.request = undefined;
        });
      this.active.add(pending);
      entry.request = request = pending;
    }
    return this.waitForToken(entry, request, signal);
  }

  private async waitForToken(
    entry: TokenEntry,
    request: TokenRequest,
    signal?: AbortSignal,
  ): Promise<CachedToken> {
    request.waiters++;
    let onAbort: (() => void) | undefined;
    try {
      return await new Promise<CachedToken>((resolve, reject) => {
        onAbort = () => reject(cancelled());
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
        request.promise.then(resolve, reject);
      });
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      if (--request.waiters === 0 && entry.request === request) {
        entry.request = undefined;
        request.controller.abort();
      }
    }
  }

  private async requestToken(
    input: VertexAuthInput,
    now: number,
    signal: AbortSignal,
  ): Promise<CachedToken> {
    let assertion: string;
    try {
      assertion = await (this.dependencies.sign ?? createServiceAccountAssertion)(
        input.serviceAccount,
        now,
      );
    } catch {
      throw new HttpError('Vertex service-account private key could not sign the request.', {
        kind: 'internal',
        code: 'invalid_credentials',
      });
    }
    if (signal.aborted) throw cancelled();
    const response = await this.http.request<unknown>({
      body: new URLSearchParams({
        assertion,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      path: '/token',
      signal,
      redirect: 'error',
      credentials: 'omit',
      maxResponseBytes: 64 * 1024,
      errorDecoder: () => ({ message: 'Vertex service-account token request failed.' }),
    });

    if (signal.aborted) throw cancelled();
    const token = GoogleTokenResponseSchema.safeParse(response.data);
    if (!token.success) {
      throw new HttpError('Vertex returned an invalid token response.', {
        kind: 'invalid_response',
      });
    }
    return {
      accessToken: token.data.access_token,
      expiresAt: now + token.data.expires_in * 1000,
    };
  }
}

async function createServiceAccountAssertion(
  serviceAccount: VertexAuthInput['serviceAccount'],
  now: number,
): Promise<string> {
  const { subtle } = await import('react-native-quick-crypto');
  const issuedAt = Math.floor(now / 1000);
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const encodedClaims = encodeBase64Url(
    JSON.stringify({
      aud: GOOGLE_TOKEN_URL,
      exp: issuedAt + 3600,
      iat: issuedAt,
      iss: serviceAccount.clientEmail,
      scope: GOOGLE_CLOUD_SCOPE,
    }),
  );
  const unsigned = `${encodedHeader}.${encodedClaims}`;
  const key = await subtle.importKey(
    'pkcs8',
    toArrayBuffer(decodePem(serviceAccount.privateKey)),
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  );
  const signature = await subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    toArrayBuffer(new TextEncoder().encode(unsigned)),
  );
  return `${unsigned}.${encodeBytesBase64Url(new Uint8Array(signature))}`;
}

function cancelled(): Error {
  return Object.assign(new Error('Vertex authentication was cancelled.'), { name: 'AbortError' });
}

function decodePem(privateKey: string): Uint8Array {
  const encoded = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!encoded) throw new Error('Vertex service-account private key is empty');
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: string): string {
  return encodeBytesBase64Url(new TextEncoder().encode(value));
}

function encodeBytesBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
