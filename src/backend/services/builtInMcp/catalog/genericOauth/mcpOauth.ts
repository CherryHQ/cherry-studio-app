import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';
import * as z from 'zod';

import { createHttpClient, isHttpError, type HttpClient } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import type { PluginAuthorizationStore } from '../../authorization/pluginAuthorization';
import {
  McpOAuthApplicationSchema,
  McpOAuthTokensSchema,
  type McpOAuthApplication,
  type McpOAuthTokens,
} from './mcpOauthCredentials';

/**
 * Generic MCP OAuth 2.1 client: RFC 9728 protected-resource discovery, RFC 8414
 * authorization-server metadata, RFC 7591 dynamic client registration and PKCE.
 *
 * Parameterized by the MCP resource URL, so one implementation serves every
 * catalog OAuth server and any user-added custom server that advertises OAuth.
 */

const clients = new Map<string, HttpClient>();

function clientFor(origin: string): HttpClient {
  let client = clients.get(origin);
  if (!client) {
    client = createHttpClient({ baseUrl: origin, timeoutMs: 15_000 });
    clients.set(origin, client);
  }
  return client;
}

const queryOf = (url: URL): Record<string, string> =>
  Object.fromEntries(url.searchParams.entries());

async function readJson(url: URL, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await clientFor(url.origin).request<unknown>({
      method: 'GET',
      path: url.pathname,
      query: queryOf(url),
      redirect: 'error',
      maxResponseBytes: 262_144,
      signal,
    });
    return response.data;
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'MCP authorization cancelled.');
    if (error instanceof PluginError) throw error;
    throw new PluginError('network', 'Could not reach the MCP authorization service.');
  }
}

async function postJson(url: URL, body: unknown, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await clientFor(url.origin).request<unknown>({
      method: 'POST',
      path: url.pathname,
      query: queryOf(url),
      body: JSON.stringify(body),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      redirect: 'error',
      maxResponseBytes: 262_144,
      signal,
    });
    return response.data;
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'MCP authorization cancelled.');
    if (error instanceof PluginError) throw error;
    if (isHttpError(error) && error.status && error.status < 500) {
      throw new PluginError('request', 'The MCP service rejected client registration.');
    }
    throw new PluginError('network', 'Could not reach the MCP authorization service.');
  }
}

async function postForm(
  url: URL,
  body: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    const response = await clientFor(url.origin).request<unknown>({
      method: 'POST',
      path: url.pathname,
      query: queryOf(url),
      body: new URLSearchParams(body).toString(),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      redirect: 'error',
      maxResponseBytes: 262_144,
      signal,
    });
    return response.data;
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'MCP authorization cancelled.');
    if (error instanceof PluginError) throw error;
    if (isHttpError(error)) {
      if (error.status === 401 || error.code === 'invalid_grant' || error.code === 'invalid_client')
        throw new PluginError('authorization', 'Reconnect this server to authorize again.');
      if (error.status === 403) throw new PluginError('access', 'The MCP service denied access.');
      if (error.status === 429)
        throw new PluginError('quota', 'The MCP authorization rate limit was reached.');
      if (error.status && error.status < 500)
        throw new PluginError('request', 'The MCP service rejected the authorization request.');
    }
    throw new PluginError('network', 'Could not reach the MCP authorization service.');
  }
}

const ResourceMetadataSchema = z.object({
  authorization_servers: z.array(z.string().url().max(2048)).optional(),
});

const AuthServerMetadataSchema = z.object({
  authorization_endpoint: z.string().url().max(2048),
  token_endpoint: z.string().url().max(2048),
  registration_endpoint: z.string().url().max(2048).optional(),
});

/** RFC 8414 / RFC 9728 well-known candidates: path insertion first, then origin root. */
function wellKnown(base: URL, suffix: string): URL[] {
  const inserted = `${base.origin}/.well-known/${suffix}${
    base.pathname === '/' ? '' : base.pathname
  }`;
  return [new URL(inserted), new URL(`${base.origin}/.well-known/${suffix}`)];
}

async function firstMatch<T>(
  candidates: readonly URL[],
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T | undefined> {
  for (const url of candidates) {
    try {
      const parsed = schema.safeParse(await readJson(url, signal));
      if (parsed.success) return parsed.data;
    } catch (error) {
      if (signal.aborted) throw error;
      // Discovery is best-effort across candidates; an unreachable one is skipped.
    }
  }
  return undefined;
}

type DiscoveredServer = {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly registrationEndpoint?: string;
};

async function discoverServer(resourceUrl: URL, signal: AbortSignal): Promise<DiscoveredServer> {
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

  if (!metadata) {
    throw new PluginError(
      'unavailable',
      'This MCP server does not advertise an OAuth authorization server.',
    );
  }
  return {
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    ...(metadata.registration_endpoint
      ? { registrationEndpoint: metadata.registration_endpoint }
      : {}),
  };
}

function redirectUrl(pluginId: string): string {
  const schemes = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(schemes) ? schemes[0] : schemes;
  const value = `${scheme}://plugins/${pluginId}/callback`;
  const parsed = z
    .string()
    .regex(/^cherrystudio(?:-dev|-preview)?:\/\/plugins\/[a-z0-9._-]+\/callback$/)
    .safeParse(value);
  if (!parsed.success)
    throw new PluginError('unavailable', 'This build has no registered native callback scheme.');
  return parsed.data;
}

async function register(
  server: DiscoveredServer,
  pluginId: string,
  signal: AbortSignal,
): Promise<McpOAuthApplication> {
  if (!server.registrationEndpoint) {
    throw new PluginError(
      'unavailable',
      'This MCP server requires a pre-registered OAuth client, which Cherry Studio does not ship.',
    );
  }
  const redirectUri = redirectUrl(pluginId);
  const registration = await postJson(
    new URL(server.registrationEndpoint),
    {
      client_name: 'Cherry Studio',
      client_uri: 'https://github.com/CherryHQ/cherry-studio-app',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    signal,
  );
  const parsed = z
    .object({
      client_id: z.string().min(1).max(16_384).regex(/^\S+$/),
      client_secret: z.string().max(16_384).optional(),
    })
    .safeParse(registration);
  if (!parsed.success)
    throw new PluginError('request', 'Invalid OAuth client registration response.');
  const application: McpOAuthApplication = {
    version: 1,
    clientId: parsed.data.client_id,
    ...(parsed.data.client_secret ? { clientSecret: parsed.data.client_secret } : {}),
    authorizationEndpoint: server.authorizationEndpoint,
    tokenEndpoint: server.tokenEndpoint,
    redirectUrl: redirectUri,
  };
  return McpOAuthApplicationSchema.parse(application);
}

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

async function exchange(
  application: McpOAuthApplication,
  body: Record<string, string>,
  resourceUrl: URL,
  signal: AbortSignal,
): Promise<McpOAuthTokens> {
  const startedAt = Date.now();
  const raw = await postForm(
    new URL(application.tokenEndpoint),
    {
      ...body,
      client_id: application.clientId,
      ...(application.clientSecret ? { client_secret: application.clientSecret } : {}),
      resource: resourceUrl.href,
    },
    signal,
  );
  const parsed = z
    .object({
      access_token: z.string().min(1).max(16_384).regex(/^\S+$/),
      refresh_token: z.string().min(1).max(16_384).regex(/^\S+$/).optional(),
      token_type: z.string().min(1).max(64),
      expires_in: z.number().finite().positive().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) throw new PluginError('request', 'Invalid OAuth token response.');
  return McpOAuthTokensSchema.parse({
    accessToken: parsed.data.access_token,
    ...(parsed.data.refresh_token ? { refreshToken: parsed.data.refresh_token } : {}),
    tokenType: parsed.data.token_type,
    ...(parsed.data.expires_in !== undefined
      ? { expiresAt: startedAt + parsed.data.expires_in * 1000 }
      : {}),
  });
}

export const mcpOauth = {
  /** Read the stored registration or register a new public client for this server. */
  async getApplication(
    store: PluginAuthorizationStore,
    resourceUrl: URL,
    pluginId: string,
    signal: AbortSignal,
  ): Promise<McpOAuthApplication> {
    const saved = await store.readApplication();
    const expectedRedirect = redirectUrl(pluginId);
    if (saved) {
      const application = McpOAuthApplicationSchema.safeParse(saved);
      if (!application.success || application.data.redirectUrl !== expectedRedirect) {
        throw new PluginError(
          'unavailable',
          'The stored registration belongs to another application build.',
        );
      }
      return application.data;
    }
    const server = await discoverServer(resourceUrl, signal);
    const application = await register(server, pluginId, signal);
    // Preserve the public-client registration; re-registering would orphan refresh tokens.
    await store.writeApplication(application);
    return application;
  },

  async challenge(application: McpOAuthApplication, resourceUrl: URL) {
    const state = randomValue();
    const verifier = randomValue();
    const codeChallenge = base64Url(
      await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: CryptoEncoding.BASE64,
      }),
    );
    const url = new URL(application.authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: application.clientId,
      redirect_uri: application.redirectUrl,
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      resource: resourceUrl.href,
    }).toString();
    return { state, verifier, authorizationUrl: url.href };
  },

  exchangeCode(
    application: McpOAuthApplication,
    code: string,
    verifier: string,
    resourceUrl: URL,
    signal: AbortSignal,
  ) {
    return exchange(
      application,
      {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: application.redirectUrl,
      },
      resourceUrl,
      signal,
    );
  },

  refresh(
    application: McpOAuthApplication,
    tokens: McpOAuthTokens,
    resourceUrl: URL,
    signal: AbortSignal,
  ) {
    if (!tokens.refreshToken)
      throw new PluginError('authorization', 'This authorization cannot be renewed.');
    return exchange(
      application,
      { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
      resourceUrl,
      signal,
    );
  },
};
