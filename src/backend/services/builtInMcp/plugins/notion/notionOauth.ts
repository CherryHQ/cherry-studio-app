import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';
import * as z from 'zod';

import { createHttpClient, isHttpError, type HttpRequest } from '@/backend/services/http';
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

const http = createHttpClient({ baseUrl: 'https://mcp.notion.com', timeoutMs: 15_000 });
const secret = z.string().min(1).max(16_384).regex(/^\S+$/);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PluginError('request', 'Invalid Notion authorization response.');
  return parsed.data;
}

async function request(input: HttpRequest) {
  try {
    const response = await http.request<unknown>({
      ...input,
      redirect: 'error',
      maxResponseBytes: 65_536,
      errorDecoder: ({ data }) => {
        const error = z.object({ error: z.string() }).safeParse(data);
        return error.success
          ? { code: error.data.error, message: 'Notion authorization failed.' }
          : undefined;
      },
    });
    return response.data;
  } catch (error) {
    if (input.signal?.aborted)
      throw new PluginError('cancelled', 'Notion authorization cancelled.');
    if (error instanceof PluginError) throw error;
    if (isHttpError(error)) {
      if (error.status === 401 || error.code === 'invalid_grant' || error.code === 'invalid_client')
        throw new PluginError('authorization', 'Reconnect Notion to authorize this client again.');
      if (error.status === 403) throw new PluginError('access', 'Notion denied access.');
      if (error.status === 429)
        throw new PluginError('quota', 'Notion authorization rate limited.');
      if (error.status && error.status < 500)
        throw new PluginError('request', 'Notion rejected the authorization request.');
    }
    throw new PluginError('network', 'Could not reach Notion authorization.');
  }
}

const MetadataSchema = z.object({
  issuer: NotionEndpointSchema,
  authorization_endpoint: NotionEndpointSchema,
  token_endpoint: NotionEndpointSchema,
  registration_endpoint: NotionEndpointSchema,
});

function redirectUrl() {
  const schemes = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(schemes) ? schemes[0] : schemes;
  const result = NotionApplicationSchema.shape.redirectUrl.safeParse(
    `${scheme}://plugins/notion/callback`,
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
  const metadata = parse(
    MetadataSchema,
    await request({
      method: 'GET',
      path: '/.well-known/oauth-authorization-server',
      signal,
    }),
  );
  const registration = parse(
    z.object({
      client_id: secret,
      token_endpoint_auth_method: z.literal('none').optional(),
    }),
    await request({
      method: 'POST',
      path: new URL(metadata.registration_endpoint).pathname,
      signal,
      body: {
        client_name: 'Cherry Studio',
        client_uri: 'https://github.com/CherryHQ/cherry-studio-app',
        redirect_uris: [redirect],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
    }),
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

async function exchange(
  application: NotionApplication,
  body: Record<string, string>,
  signal: AbortSignal,
): Promise<NotionTokens> {
  const startedAt = Date.now();
  const tokens = parse(
    z.object({
      access_token: secret,
      refresh_token: secret,
      token_type: z.string().refine((value) => value.toLowerCase() === 'bearer'),
      expires_in: z.number().int().positive(),
    }),
    await request({
      method: 'POST',
      path: new URL(application.tokenEndpoint).pathname,
      body: new URLSearchParams({ ...body, client_id: application.clientId }).toString(),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    }),
  );
  return parse(NotionTokensSchema, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: startedAt + tokens.expires_in * 1000,
  });
}

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

export const notionOauth = {
  getApplication,
  async challenge(application: NotionApplication) {
    const state = randomValue();
    const verifier = randomValue();
    const challenge = base64Url(
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
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: 'https://mcp.notion.com/mcp',
    }).toString();
    return { state, verifier, authorizationUrl: url.href };
  },
  exchangeCode(
    application: NotionApplication,
    code: string,
    verifier: string,
    signal: AbortSignal,
  ) {
    return exchange(
      application,
      {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: application.redirectUrl,
        resource: 'https://mcp.notion.com/mcp',
      },
      signal,
    );
  },
  refresh(application: NotionApplication, tokens: NotionTokens, signal: AbortSignal) {
    return exchange(
      application,
      {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        resource: 'https://mcp.notion.com/mcp',
      },
      signal,
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
      { url: 'https://mcp.notion.com/mcp' },
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
