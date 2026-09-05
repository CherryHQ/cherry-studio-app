import * as z from 'zod';

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
  projectId: string;
  serviceAccount: {
    clientEmail: string;
    privateKey: string;
  };
};

export class VertexAuthClient {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<CachedToken>>();

  constructor(
    private readonly dependencies: {
      fetch?: typeof globalThis.fetch;
      now?: () => number;
    } = {},
  ) {}

  async getAuthorizationHeaders(input: VertexAuthInput): Promise<Record<string, string>> {
    const token = await this.getToken(input);
    return { Authorization: `Bearer ${token.accessToken}` };
  }

  private async getToken(input: VertexAuthInput): Promise<CachedToken> {
    const now = this.dependencies.now?.() ?? Date.now();
    const key = `${input.projectId}:${input.serviceAccount.clientEmail}`;
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt - TOKEN_EXPIRY_BUFFER_MS) return cached;

    let request = this.inflight.get(key);
    if (!request) {
      request = this.requestToken(input, now).finally(() => this.inflight.delete(key));
      this.inflight.set(key, request);
    }
    return request;
  }

  private async requestToken(input: VertexAuthInput, now: number): Promise<CachedToken> {
    const assertion = await createServiceAccountAssertion(input.serviceAccount, now);
    const response = await (this.dependencies.fetch ?? globalThis.fetch)(GOOGLE_TOKEN_URL, {
      body: new URLSearchParams({
        assertion,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Vertex service-account token request failed: ${response.status}`);
    }

    const token = GoogleTokenResponseSchema.parse(await response.json());
    const cached = {
      accessToken: token.access_token,
      expiresAt: now + token.expires_in * 1000,
    };
    this.cache.set(`${input.projectId}:${input.serviceAccount.clientEmail}`, cached);
    return cached;
  }
}

async function createServiceAccountAssertion(
  serviceAccount: VertexAuthInput['serviceAccount'],
  now: number,
): Promise<string> {
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
  const key = await crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(decodePem(serviceAccount.privateKey)),
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    toArrayBuffer(new TextEncoder().encode(unsigned)),
  );
  return `${unsigned}.${encodeBytesBase64Url(new Uint8Array(signature))}`;
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
