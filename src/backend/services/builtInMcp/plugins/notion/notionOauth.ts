import {
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  type AuthorizationServerMetadata,
  type FetchLike,
} from '@modelcontextprotocol/client';
import * as z from 'zod';

import { createFetchBridge, isHttpError } from '@/backend/services/http';
import { createPkceChallenge, nativeCallbackUrl, randomOauthValue } from '@/backend/utils/oauth';
import { PluginError } from '@/shared/contracts/plugins';

import type { PluginAuthorizationStore } from '../../authorization/pluginAuthorization';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import {
  NotionApplicationSchema,
  NotionEndpointSchema,
  NotionTokensSchema,
  type NotionApplication,
  type NotionTokens,
} from './notionCredentials';
import { readNotionSelf } from './notionSelf';

const AUTHORIZATION_SERVER = 'https://mcp.notion.com/';
const RESOURCE = 'https://mcp.notion.com/mcp';
const secret = z.string().min(1).max(16_384).regex(/^\S+$/);
const invalidResponse = () => new PluginError('request', 'Invalid Notion authorization response.');

/** SDK metadata, registration and token requests stay on Notion's MCP host over the shared transport. */
const notionFetch = createFetchBridge({
  assertUrl: (value) => {
    if (!NotionEndpointSchema.safeParse(value).success) throw invalidResponse();
    return new URL(value);
  },
  unsupportedMethodError: invalidResponse,
  maxResponseBytes: 65_536,
  timeoutMs: 15_000,
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function errorCode(body: string): string | undefined {
  try {
    const parsed = z.object({ error: z.string() }).safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.error : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs SDK protocol steps with the caller's cancellation and maps failures by the first rejected
 * HTTP status and OAuth error code. SDK error text can contain response bodies and never escapes.
 */
async function protocol<T>(
  signal: AbortSignal,
  operation: (fetchFn: FetchLike) => Promise<T>,
): Promise<T> {
  let failure: { status: number; code?: string } | undefined;
  const fetchFn: FetchLike = async (input, init) => {
    const response = await notionFetch(input, { ...init, signal });
    if (response.ok || failure) return response;
    const body = await response.text();
    failure = { status: response.status, code: errorCode(body) };
    return new Response(body, { status: response.status, headers: response.headers });
  };
  try {
    return await operation(fetchFn);
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'Notion authorization cancelled.');
    if (error instanceof PluginError) throw error;
    if (!failure) {
      if (isHttpError(error))
        throw new PluginError('network', 'Could not reach Notion authorization.');
      throw invalidResponse();
    }
    const { status, code } = failure;
    const metadata = { statusCode: status };
    if (status === 401 || code === 'invalid_grant' || code === 'invalid_client')
      throw new PluginError(
        'authorization',
        'Reconnect Notion to authorize this client again.',
        metadata,
      );
    if (status === 403) throw new PluginError('access', 'Notion denied access.', metadata);
    if (status === 429)
      throw new PluginError('quota', 'Notion authorization rate limited.', metadata);
    if (status < 500)
      throw new PluginError('request', 'Notion rejected the authorization request.', metadata);
    throw new PluginError('network', 'Could not reach Notion authorization.', metadata);
  }
}

const MetadataSchema = z.object({
  issuer: NotionEndpointSchema,
  authorization_endpoint: NotionEndpointSchema,
  token_endpoint: NotionEndpointSchema,
  registration_endpoint: NotionEndpointSchema,
});

/** Token requests use only the persisted endpoints, so registrations saved by older builds still renew. */
const tokenServer = (application: NotionApplication): AuthorizationServerMetadata => ({
  issuer: AUTHORIZATION_SERVER,
  authorization_endpoint: application.authorizationEndpoint,
  token_endpoint: application.tokenEndpoint,
  response_types_supported: ['code'],
});

function redirectUrl() {
  const result = NotionApplicationSchema.shape.redirectUrl.safeParse(
    nativeCallbackUrl('plugins/notion/callback'),
  );
  if (!result.success)
    throw new PluginError('unavailable', 'Notion requires a Cherry native application.');
  return result.data;
}

async function getApplication(store: PluginAuthorizationStore, signal: AbortSignal) {
  const saved = await store.readApplication();
  const redirect = redirectUrl();
  if (saved) {
    const application = parse(NotionApplicationSchema, saved);
    if (application.redirectUrl !== redirect)
      throw new PluginError(
        'unavailable',
        'The Notion registration belongs to another application build.',
      );
    return application;
  }
  const discovered = await protocol(signal, async (fetchFn) => {
    const metadata = await discoverAuthorizationServerMetadata(AUTHORIZATION_SERVER, { fetchFn });
    if (!metadata) throw new Error('Notion authorization metadata is unavailable.');
    return metadata;
  });
  const metadata = parse(MetadataSchema, discovered);
  const registration = parse(
    z.object({
      client_id: secret,
      token_endpoint_auth_method: z.literal('none').optional(),
    }),
    await protocol(signal, (fetchFn) =>
      registerClient(AUTHORIZATION_SERVER, {
        metadata: discovered,
        fetchFn,
        clientMetadata: {
          client_name: 'Cherry Studio',
          client_uri: 'https://github.com/CherryHQ/cherry-studio-app',
          redirect_uris: [redirect],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
      }),
    ),
  );
  signal.throwIfAborted();
  const application: NotionApplication = {
    version: 1,
    clientId: registration.client_id,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    redirectUrl: redirect,
  };
  // Preserve this public-client registration; re-registering would orphan refresh tokens.
  await store.writeApplication(application);
  signal.throwIfAborted();
  return application;
}

const TokenResponseSchema = z.object({
  access_token: secret,
  refresh_token: secret,
  token_type: z.string().refine((value) => value.toLowerCase() === 'bearer'),
  expires_in: z.number().int().positive(),
});

async function tokens(
  signal: AbortSignal,
  operation: (fetchFn: FetchLike) => Promise<unknown>,
): Promise<NotionTokens> {
  const startedAt = Date.now();
  const response = parse(TokenResponseSchema, await protocol(signal, operation));
  return parse(NotionTokensSchema, {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: startedAt + response.expires_in * 1000,
  });
}

export const notionOauth = {
  getApplication,
  async challenge(application: NotionApplication) {
    const state = randomOauthValue();
    const { verifier, challenge } = await createPkceChallenge();
    const url = new URL(application.authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: application.clientId,
      redirect_uri: application.redirectUrl,
      response_type: 'code',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: RESOURCE,
    }).toString();
    return { state, verifier, authorizationUrl: url.href };
  },
  exchangeCode(
    application: NotionApplication,
    code: string,
    verifier: string,
    signal: AbortSignal,
  ) {
    // A public client: with no secret the SDK authenticates with client_id in the form body.
    return tokens(signal, (fetchFn) =>
      exchangeAuthorization(AUTHORIZATION_SERVER, {
        metadata: tokenServer(application),
        clientInformation: { client_id: application.clientId },
        authorizationCode: code,
        codeVerifier: verifier,
        redirectUri: application.redirectUrl,
        resource: RESOURCE,
        fetchFn,
      }),
    );
  },
  refresh(application: NotionApplication, current: NotionTokens, signal: AbortSignal) {
    return tokens(signal, (fetchFn) =>
      refreshAuthorization(AUTHORIZATION_SERVER, {
        metadata: tokenServer(application),
        clientInformation: { client_id: application.clientId },
        refreshToken: current.refreshToken,
        resource: RESOURCE,
        fetchFn,
      }),
    );
  },
  async getAccount(accessToken: string, signal: AbortSignal) {
    const client = await createOfficialMcpClient(
      {
        pluginId: 'notion',
        tools: { 'notion-fetch': 'read' },
        signal,
        getCredential: async () => ({ accessToken }),
        assertAuthorized: async () => signal.throwIfAborted(),
        authorization: {
          apply: (_, { headers }) => {
            headers.set('Authorization', `Bearer ${accessToken}`);
          },
        },
      },
      { url: RESOURCE },
    );
    try {
      return readNotionSelf(
        await client.callTool({
          name: 'notion-fetch',
          args: { id: 'self' },
          options: { abortSignal: signal },
        }),
      );
    } finally {
      await client.close().catch(() => undefined);
    }
  },
};
