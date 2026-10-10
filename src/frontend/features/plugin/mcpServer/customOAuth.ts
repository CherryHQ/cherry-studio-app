import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { fetch as expoFetch } from 'expo/fetch';
import * as z from 'zod';

/**
 * OAuth 2.1 auto-connect for user-added ("custom") MCP servers.
 *
 * Mirrors the MCP authorization spec — RFC 9728 protected-resource discovery,
 * RFC 8414 authorization-server metadata, RFC 7591 dynamic client registration
 * and PKCE — without a bundled plugin identity. Acquired tokens are stored in
 * the device's encrypted keystore (expo-secure-store) and returned as request
 * headers for the server connection.
 *
 * Kept inside the frontend feature on purpose: it depends only on Expo platform
 * modules and shared types, so it does not reach across the UI boundary.
 */

const TOKEN = z.string().min(1).max(16_384).regex(/^\S+$/);

const StoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const ResourceMetadataSchema = z.object({
  authorization_servers: z.array(z.string().url().max(2048)).optional(),
});
const AuthServerMetadataSchema = z.object({
  authorization_endpoint: z.string().url().max(2048),
  token_endpoint: z.string().url().max(2048),
  registration_endpoint: z.string().url().max(2048).optional(),
});
const TokenResponseSchema = z.object({
  access_token: TOKEN,
  refresh_token: TOKEN.optional(),
  token_type: z.string().min(1).max(64),
  expires_in: z.number().finite().positive().optional(),
});

export type CustomOAuthResult = { headers: Record<string, string> };

export class CustomOAuthError extends Error {
  constructor(
    readonly reason: 'unavailable' | 'cancelled' | 'request' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'CustomOAuthError';
  }
}

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

function scheme(): string {
  const configured = Constants.expoConfig?.scheme;
  const value = Array.isArray(configured) ? configured[0] : configured;
  return value ?? 'cherrystudio';
}

function redirectUrl(): string {
  return `${scheme()}://mcp-oauth/callback`;
}

async function getJson(url: URL, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await expoFetch(url.href, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal,
    });
  } catch {
    throw new CustomOAuthError('network', 'Could not reach the MCP authorization service.');
  }
  if (!response.ok)
    throw new CustomOAuthError('request', `The MCP service returned HTTP ${response.status}.`);
  return response.json();
}

function wellKnown(base: URL, suffix: string): URL[] {
  const inserted = `${base.origin}/.well-known/${suffix}${
    base.pathname === '/' ? '' : base.pathname
  }`;
  return [new URL(inserted), new URL(`${base.origin}/.well-known/${suffix}`)];
}

async function firstMatch<T>(
  candidates: readonly URL[],
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T | undefined> {
  for (const url of candidates) {
    try {
      const parsed = schema.safeParse(await getJson(url, signal));
      if (parsed.success) return parsed.data;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return undefined;
}

async function discover(resourceUrl: URL, signal?: AbortSignal) {
  const resource = await firstMatch(
    wellKnown(resourceUrl, 'oauth-protected-resource'),
    ResourceMetadataSchema,
    signal,
  );
  const authorizationServer = resource?.authorization_servers?.[0]
    ? new URL(resource.authorization_servers[0])
    : new URL(resourceUrl.origin);
  const metadata =
    (await firstMatch(
      wellKnown(authorizationServer, 'oauth-authorization-server'),
      AuthServerMetadataSchema,
      signal,
    )) ??
    (await firstMatch(
      [new URL(`${authorizationServer.origin}/.well-known/openid-configuration`)],
      AuthServerMetadataSchema,
      signal,
    ));
  if (!metadata)
    throw new CustomOAuthError(
      'unavailable',
      'This server does not advertise an OAuth authorization server.',
    );
  return metadata;
}

async function register(
  metadata: z.infer<typeof AuthServerMetadataSchema>,
  signal?: AbortSignal,
): Promise<{ clientId: string; clientSecret?: string }> {
  if (!metadata.registration_endpoint)
    throw new CustomOAuthError(
      'unavailable',
      'This server needs a pre-registered OAuth client, which Cherry Studio does not ship.',
    );
  let response: Response;
  try {
    response = await expoFetch(metadata.registration_endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Cherry Studio',
        client_uri: 'https://github.com/CherryHQ/cherry-studio-app',
        redirect_uris: [redirectUrl()],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
      redirect: 'error',
      signal,
    });
  } catch {
    throw new CustomOAuthError('network', 'Could not reach the MCP authorization service.');
  }
  if (!response.ok)
    throw new CustomOAuthError('request', 'The MCP service rejected client registration.');
  const parsed = z
    .object({ client_id: TOKEN, client_secret: TOKEN.optional() })
    .safeParse(await response.json());
  if (!parsed.success)
    throw new CustomOAuthError('request', 'Invalid OAuth client registration response.');
  return {
    clientId: parsed.data.client_id,
    ...(parsed.data.client_secret ? { clientSecret: parsed.data.client_secret } : {}),
  };
}

async function exchangeToken(
  metadata: z.infer<typeof AuthServerMetadataSchema>,
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<z.infer<typeof TokenResponseSchema>> {
  let response: Response;
  try {
    response = await expoFetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      redirect: 'error',
      signal,
    });
  } catch {
    throw new CustomOAuthError('network', 'Could not reach the MCP authorization service.');
  }
  if (!response.ok)
    throw new CustomOAuthError('request', 'The MCP service rejected the authorization request.');
  const parsed = TokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new CustomOAuthError('request', 'Invalid OAuth token response.');
  return parsed.data;
}

export function isValidServerUrl(endpointUrl: string): boolean {
  try {
    const url = new URL(endpointUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** A keystore key is restricted to `[A-Za-z0-9._-]`; derive one from the endpoint. */
async function storageKey(endpointUrl: string): Promise<string> {
  const digest = base64Url(
    await digestStringAsync(CryptoDigestAlgorithm.SHA256, endpointUrl, {
      encoding: CryptoEncoding.BASE64,
    }),
  );
  return `mcp.oauth.${digest}`;
}

/**
 * Run the full flow and return headers to attach to the server connection.
 * Rejects with a CustomOAuthError on failure or user cancellation.
 */
export async function runCustomMcpOAuth(
  endpointUrl: string,
  signal?: AbortSignal,
): Promise<CustomOAuthResult> {
  let resource: URL;
  try {
    resource = new URL(endpointUrl);
  } catch {
    throw new CustomOAuthError('request', 'Enter a valid server URL first.');
  }
  if (resource.protocol !== 'https:')
    throw new CustomOAuthError('request', 'OAuth requires an https server URL.');

  const metadata = await discover(resource, signal);
  const { clientId, clientSecret } = await register(metadata, signal);

  const state = randomValue();
  const verifier = randomValue();
  const codeChallenge = base64Url(
    await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: CryptoEncoding.BASE64,
    }),
  );

  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUrl(),
    response_type: 'code',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    resource: resource.href,
  }).toString();

  const result = await WebBrowser.openAuthSessionAsync(authorizationUrl.href, redirectUrl());
  if (result.type !== 'success')
    throw new CustomOAuthError('cancelled', 'Authorization was cancelled.');

  const callback = new URL(result.url);
  if (callback.searchParams.get('state') !== state)
    throw new CustomOAuthError('request', 'Invalid authorization callback.');
  const code = callback.searchParams.get('code');
  if (!code)
    throw new CustomOAuthError('request', 'The server did not return an authorization code.');

  const tokens = await exchangeToken(
    metadata,
    {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUrl(),
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      resource: resource.href,
    },
    signal,
  );

  // Durable copy lives in the encrypted keystore, never in SQLite.
  await SecureStore.setItemAsync(
    await storageKey(endpointUrl),
    JSON.stringify({
      version: 1,
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      tokenType: tokens.token_type,
      ...(tokens.expires_in ? { expiresAt: Date.now() + tokens.expires_in * 1000 } : {}),
    }),
    StoreOptions,
  );

  return { headers: { Authorization: `Bearer ${tokens.access_token}` } };
}

/** Read the stored access token for a custom server, if any. */
export async function readCustomMcpOAuthToken(endpointUrl: string): Promise<string | undefined> {
  const raw = await SecureStore.getItemAsync(await storageKey(endpointUrl), StoreOptions);
  if (!raw) return undefined;
  const parsed = z.object({ accessToken: TOKEN }).safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data.accessToken : undefined;
}

/** Drop the stored token when a custom server is deleted or reconnected. */
export async function clearCustomMcpOAuthToken(endpointUrl: string): Promise<void> {
  await SecureStore.deleteItemAsync(await storageKey(endpointUrl), StoreOptions);
}
