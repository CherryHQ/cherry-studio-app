import * as mcp from '@ai-sdk/mcp';

import { isBuiltInMcpToolAllowed } from '../../pluginRegistry';
import { FEISHU_REQUIRED_SCOPES } from '../../plugins/feishu/feishuTools';
import { createBuiltInMcpClient as createClient } from '../createBuiltInMcpClient';
import { validatePluginConnection } from '../validatePluginConnection';

const mockFetch = jest.fn();
const mockGetGrant = jest.fn();
const mockResolveCredential = jest.fn();
const authorizations = {
  get: jest.fn(),
  credentials: { getCredentialGrant: (...args: unknown[]) => mockGetGrant(...args) },
};
function createBuiltInMcpClient(pluginId: string, authorizationId: string, signal: AbortSignal) {
  return createClient(pluginId, authorizationId, signal, authorizations);
}
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: jest.fn() }),
  isHttpError: () => false,
}));
jest.mock('@ai-sdk/mcp', () => {
  const actual = jest.requireActual<typeof mcp>('@ai-sdk/mcp');
  return { ...actual, createMCPClient: jest.fn(actual.createMCPClient) };
});
jest.mock('../../plugins/github/githubOauth', () => ({
  ...jest.requireActual('../../plugins/github/githubOauth'),
  getGithubApplication: () => ({
    clientId: 'cherry_oauth_client',
    clientSecret: 'public-client-secret',
    redirectUrl: 'cherrystudio-dev://plugins/github/callback',
  }),
}));
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('@/backend/data/services/PluginAuthorizationService', () => ({
  pluginAuthorizationService: {
    async getAuthorizedGrant(...args: unknown[]) {
      const grant = await mockGetGrant(...args);
      return {
        id: grant.id,
        authMethod: grant.authMethod,
        credentialReference: {
          storage: 'secure-store-v1',
          id: '00000000-0000-4000-8000-000000000001',
        },
      };
    },
  },
}));

type RpcRequest = { id?: number; method: string; params?: Record<string, unknown> };
const definitions = [
  { name: 'get_me', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'issue_write',
    inputSchema: { type: 'object', properties: { method: { type: 'string' } } },
  },
  {
    name: 'maps_weather',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  },
  { name: 'fetch-doc', inputSchema: { type: 'object', properties: {} } },
  { name: 'create-doc', inputSchema: { type: 'object', properties: {} } },
];

function reply(request: RpcRequest, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
    headers: { 'content-type': 'application/json' },
  });
}

function respond(_url: string, init?: RequestInit): Response {
  if (init?.method === 'GET') return new Response(null, { status: 405 });
  if (init?.method === 'DELETE') return new Response(null, { status: 204 });
  const request: RpcRequest = JSON.parse(String(init?.body));
  if (request.method === 'initialize') {
    return reply(request, {
      protocolVersion: request.params?.protocolVersion,
      serverInfo: { name: 'official-fixture', version: '1' },
      capabilities: { tools: {} },
    });
  }
  if (request.id === undefined) return new Response(null, { status: 202 });
  if (request.method === 'tools/list') return reply(request, { tools: definitions });
  return reply(request, {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          request.params?.name === 'maps_weather'
            ? { forecasts: [{ city: '北京' }] }
            : { login: 'cherry' },
        ),
      },
    ],
  });
}

function toolRequests(): RpcRequest[] {
  return mockFetch.mock.calls.flatMap(([, init]: [string, RequestInit]) => {
    if (typeof init?.body !== 'string') return [];
    const request: RpcRequest = JSON.parse(init.body);
    return request.method === 'tools/call' ? [request] : [];
  });
}

/** The SDK opens its optional GET stream after initialization resolves; let it land first. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.mocked(mcp.createMCPClient).mockClear();
  mockFetch.mockReset().mockImplementation(respond);
  mockGetGrant.mockReset().mockImplementation(async (pluginId: string) => ({
    id: 'grant-1',
    credential:
      pluginId === 'amap'
        ? { version: 1, key: 'private-key' }
        : { version: 1, token: 'private-key' },
    authMethod: pluginId === 'amap' ? 'api_key' : 'personal_token',
  }));
  authorizations.get.mockReset().mockReturnValue({ resolveCredential: mockResolveCredential });
  mockResolveCredential.mockReset().mockResolvedValue(userCredential);
});
afterEach(() => jest.restoreAllMocks());

const userCredential = {
  version: 1,
  application: { appId: 'cli_cherry', appSecret: 'private-app-secret' },
  tokens: {
    accessToken: 'user-token-first',
    refreshToken: 'user-refresh',
    expiresAt: 7200000,
    refreshExpiresAt: 86400000,
    scope: FEISHU_REQUIRED_SCOPES.join(' '),
  },
};

it('rotates user tokens behind a stable grant reference without rejecting the grant', async () => {
  mockGetGrant.mockResolvedValue({
    id: 'user-grant',
    credential: userCredential,
    authMethod: 'feishu_user',
  });
  const client = await createBuiltInMcpClient('feishu', 'user-grant', new AbortController().signal);
  try {
    await settle();
    mockResolveCredential.mockImplementation(async () => {
      const credential = {
        ...userCredential,
        tokens: { ...userCredential.tokens, accessToken: 'user-token-rotated' },
      };
      mockGetGrant.mockResolvedValue({ id: 'user-grant', credential, authMethod: 'feishu_user' });
      return credential;
    });
    mockFetch.mockClear();
    await client.listTools();
    expect(mockFetch).toHaveBeenCalled();
    for (const [, init] of mockFetch.mock.calls as [string, RequestInit][]) {
      const headers = new Headers(init.headers);
      expect(headers.get('X-Lark-MCP-UAT')).toBe('user-token-rotated');
    }
    await client.listTools();
    mockFetch.mockImplementation((url, init) => {
      if (init?.body && JSON.parse(init.body).method === 'tools/call')
        return new Response(null, { status: 401 });
      return respond(url, init);
    });
    await expect(client.callTool({ name: 'create-doc', args: {} })).rejects.toMatchObject({
      reason: 'authorization',
    });
    expect(toolRequests()).toHaveLength(1);
  } finally {
    await client.close();
  }
});

it('does not send a user token if its durable authorization is revoked during refresh', async () => {
  mockGetGrant.mockResolvedValue({
    id: 'user-grant',
    credential: userCredential,
    authMethod: 'feishu_user',
  });
  mockResolveCredential.mockImplementation(async () => {
    mockGetGrant.mockRejectedValue(new Error('revoked'));
    return userCredential;
  });
  await expect(
    createBuiltInMcpClient('feishu', 'user-grant', new AbortController().signal),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(mockFetch).not.toHaveBeenCalled();
});

it('connects Feishu as the user without storing credentials in MCP configuration or calling business tools', async () => {
  await expect(validatePluginConnection('feishu', 'feishu_user', userCredential)).resolves.toBe(
    'Feishu user',
  );
  expect(toolRequests()).toEqual([]);
  const config = jest.mocked(mcp.createMCPClient).mock.calls[0][0];
  expect(JSON.stringify(config)).not.toMatch(/private-app-secret|user-token-first|user-refresh/);
  for (const [url, init] of mockFetch.mock.calls as [string, RequestInit][]) {
    const headers = new Headers(init.headers);
    expect(url).toBe('https://mcp.feishu.cn/mcp');
    expect(headers.get('X-Lark-MCP-UAT')).toBe('user-token-first');
    expect(headers.get('X-Lark-MCP-Allowed-Tools')?.split(',')).toContain('create-doc');
    expect(headers.get('X-Lark-MCP-Allowed-Tools')).not.toMatch(
      /base_|task_|calendar_|wiki_get_node/,
    );
    expect(headers.has('Authorization')).toBe(false);
    expect(init.redirect).toBe('error');
    expect(JSON.stringify(init)).not.toMatch(/private-app-secret|user-refresh/);
  }
  expect(isBuiltInMcpToolAllowed('feishu', 'search-doc')).toBe(true);
  expect(isBuiltInMcpToolAllowed('feishu', 'search-user')).toBe(true);
});

it('rechecks user authorization before every Feishu request', async () => {
  mockGetGrant.mockResolvedValue({ id: 'grant-feishu', authMethod: 'feishu_user' });
  const client = await createBuiltInMcpClient(
    'feishu',
    'grant-feishu',
    new AbortController().signal,
  );
  try {
    await client.listTools();
    mockGetGrant.mockRejectedValue(new Error('revoked'));
    mockFetch.mockClear();
    await expect(client.listTools()).rejects.toMatchObject({ reason: 'authorization' });
    expect(mockFetch).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it.each([
  ['github', 'https://api.githubcopilot.com/mcp/'],
  ['amap', 'https://mcp.amap.com/mcp'],
] as const)(
  'connects %s through the real HTTP SDK without storing credentials in its config',
  async (pluginId, endpoint) => {
    const create = jest.mocked(mcp.createMCPClient);
    const signal = new AbortController().signal;
    const client = await createBuiltInMcpClient(pluginId, 'grant-1', signal);
    try {
      await client.listTools({ options: { signal } });
      const config = create.mock.calls[0][0];
      expect(config).toMatchObject({
        maxRetries: 0,
        transport: { type: 'http', url: endpoint, redirect: 'error' },
      });
      expect(config.transport).not.toHaveProperty('authProvider');
      expect(JSON.stringify(config)).not.toContain('private-key');
      for (const [url, init] of mockFetch.mock.calls as [string, RequestInit][]) {
        const headers = new Headers(init.headers);
        expect(init.redirect).toBe('error');
        if (pluginId === 'github') {
          expect(url).toBe(endpoint);
          expect(headers.get('Authorization')).toBe('Bearer private-key');
          expect(headers.get('X-MCP-Tools')?.split(',')).toContain('issue_write');
        } else {
          expect(new URL(url).searchParams.get('key')).toBe('private-key');
          expect(headers.has('Authorization')).toBe(false);
        }
      }
      expect(mockGetGrant).toHaveBeenCalledWith(pluginId, 'grant-1');
    } finally {
      await client.close();
    }
  },
);

it('rejects a retired credential reference before another HTTP request', async () => {
  const client = await createBuiltInMcpClient('github', 'old-grant', new AbortController().signal);
  try {
    await client.listTools();
    mockGetGrant.mockRejectedValue(new Error('private database details'));
    mockFetch.mockClear();
    await expect(client.listTools()).rejects.toMatchObject({
      reason: 'authorization',
      stack: undefined,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it('rejects unexpected tool names and targets before credential injection', async () => {
  const create = jest.mocked(mcp.createMCPClient);
  const client = await createBuiltInMcpClient('github', 'grant-1', new AbortController().signal);
  try {
    const transport = create.mock.calls[0][0].transport as Extract<
      mcp.MCPClientConfig['transport'],
      { type: 'http' | 'sse' }
    >;
    await settle();
    mockFetch.mockClear();
    mockGetGrant.mockClear();
    await expect(transport.fetch!('https://untrusted.example/mcp', {})).rejects.toMatchObject({
      reason: 'request',
    });
    await expect(
      transport.fetch!(transport.url, {
        method: 'POST',
        body: JSON.stringify({ method: 'tools/call', params: { name: 'delete_repository' } }),
      }),
    ).rejects.toMatchObject({ reason: 'access' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGetGrant).not.toHaveBeenCalled();
    expect(isBuiltInMcpToolAllowed('github', 'issue_write')).toBe(true);
    expect(isBuiltInMcpToolAllowed('github', 'delete_repository')).toBe(false);
    expect(isBuiltInMcpToolAllowed('amap', 'maps_schema_take_taxi')).toBe(false);
    expect(isBuiltInMcpToolAllowed('amap', 'search_district')).toBe(false);
  } finally {
    await client.close();
  }
});

it.each([401, 403, 429, 500])(
  'redacts HTTP %s diagnostics and never replays a write',
  async (status) => {
    const client = await createBuiltInMcpClient('github', 'grant-1', new AbortController().signal);
    try {
      await client.listTools();
      mockFetch.mockImplementation((url, init) => {
        if (init?.body && JSON.parse(init.body).method === 'tools/call') {
          return new Response('private-key upstream stack', { status });
        }
        return respond(url, init);
      });
      const error = await Promise.resolve(
        client.callTool({ name: 'issue_write', args: { method: 'create' } }),
      ).catch((value: unknown) => value);
      expect(error).toMatchObject({
        reason:
          status === 500
            ? 'unknown-write'
            : status === 401
              ? 'authorization'
              : status === 403
                ? 'access'
                : 'quota',
      });
      expect(JSON.stringify(error)).not.toMatch(/private-key|upstream stack/);
      expect(toolRequests()).toHaveLength(1);
    } finally {
      await client.close();
    }
  },
);

it('reports an unknown write outcome after a connection failure without replay', async () => {
  const client = await createBuiltInMcpClient('github', 'grant-1', new AbortController().signal);
  try {
    await client.listTools();
    mockFetch.mockImplementation((url, init) => {
      if (init?.body && JSON.parse(init.body).method === 'tools/call')
        throw new Error('private-key');
      return respond(url, init);
    });
    await expect(
      client.callTool({ name: 'issue_write', args: { method: 'create' } }),
    ).rejects.toMatchObject({ reason: 'unknown-write' });
    expect(toolRequests()).toHaveLength(1);
  } finally {
    await client.close();
  }
});

it('does not send a request cancelled while resolving credentials', async () => {
  const client = await createBuiltInMcpClient('github', 'grant-1', new AbortController().signal);
  try {
    await client.listTools();
    const controller = new AbortController();
    mockGetGrant.mockImplementation(async () => {
      controller.abort();
      return {
        id: 'grant-1',
        credential: { version: 1, token: 'private-key' },
        authMethod: 'personal_token',
      };
    });
    mockFetch.mockClear();
    await expect(client.listTools({ options: { signal: controller.signal } })).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it.each([
  ['github', 'get_me', {}, 'cherry'],
  ['amap', 'maps_weather', { city: '110000' }, 'Web Service'],
] as const)(
  'validates %s using only a read-only cloud tool',
  async (pluginId, name, args, label) => {
    await expect(
      validatePluginConnection(
        pluginId,
        pluginId === 'github' ? 'personal_token' : 'api_key',
        pluginId === 'github'
          ? { version: 1, token: 'entered-key' }
          : { version: 1, key: 'entered-key' },
      ),
    ).resolves.toBe(label);
    expect(toolRequests().map((request) => request.params)).toEqual([{ name, arguments: args }]);
    expect(mockGetGrant).not.toHaveBeenCalled();
  },
);

it('rejects tool-reported credential failure without exposing upstream text', async () => {
  mockFetch.mockImplementation((url, init) => {
    if (init?.body && JSON.parse(init.body).method === 'tools/call') {
      return reply(JSON.parse(init.body), {
        isError: true,
        content: [{ type: 'text', text: 'entered-key rejected' }],
      });
    }
    return respond(url, init);
  });
  const error = await validatePluginConnection('amap', 'api_key', {
    version: 1,
    key: 'entered-key',
  }).catch((value: unknown) => value);
  expect(error).toMatchObject({ reason: 'request' });
  expect(JSON.stringify(error)).not.toContain('entered-key');
});

it('follows tool-list pagination to find the validation tool', async () => {
  mockFetch.mockImplementation((url, init) => {
    const request: RpcRequest | undefined = init?.body ? JSON.parse(init.body) : undefined;
    if (request?.method === 'tools/list' && !request.params?.cursor) {
      return reply(request, { tools: [], nextCursor: 'next' });
    }
    return respond(url, init);
  });
  await expect(
    validatePluginConnection('github', 'personal_token', { version: 1, token: 'entered-key' }),
  ).resolves.toBe('cherry');
});

it.each([undefined, 'repeated'])(
  'rejects missing validation tools with cursor %s instead of accepting an unverified grant',
  async (nextCursor) => {
    mockFetch.mockImplementation((url, init) => {
      const request: RpcRequest | undefined = init?.body ? JSON.parse(init.body) : undefined;
      if (request?.method === 'tools/list') return reply(request, { tools: [], nextCursor });
      return respond(url, init);
    });
    await expect(
      validatePluginConnection('github', 'personal_token', { version: 1, token: 'entered-key' }),
    ).rejects.toMatchObject({
      reason: 'request',
    });
    expect(toolRequests()).toEqual([]);
  },
);

it('rejects an empty weather response even when the MCP envelope reports success', async () => {
  mockFetch.mockImplementation((url, init) => {
    if (init?.body && JSON.parse(init.body).method === 'tools/call') {
      return reply(JSON.parse(init.body), {
        content: [{ type: 'text', text: '{"forecasts":[]}' }],
      });
    }
    return respond(url, init);
  });
  await expect(
    validatePluginConnection('amap', 'api_key', { version: 1, key: 'entered-key' }),
  ).rejects.toMatchObject({
    reason: 'request',
  });
});

it('keeps unregistered plugins inert without resolving grants or starting a client', async () => {
  expect(isBuiltInMcpToolAllowed('vendor.future-plugin', 'get_me')).toBe(false);
  await expect(
    createBuiltInMcpClient('vendor.future-plugin', 'grant', new AbortController().signal),
  ).rejects.toMatchObject({ reason: 'unavailable' });
  expect(mockGetGrant).not.toHaveBeenCalled();
  expect(mcp.createMCPClient).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

it('rejects an unsupported stored authorization method before transmitting credentials', async () => {
  mockGetGrant.mockResolvedValue({
    credential: { version: 1, token: 'private-key' },
    authMethod: 'future_method_v2',
  });
  await expect(
    createBuiltInMcpClient('github', 'grant', new AbortController().signal),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(mockFetch).not.toHaveBeenCalled();
});

it('returns a rejected interactive credential to its method with the bound grant and never replays the write', async () => {
  const rejectCredential = jest.fn(async () => {});
  mockGetGrant.mockResolvedValue({ id: 'grant-user', authMethod: 'feishu_user' });
  authorizations.get.mockReturnValue({
    resolveCredential: mockResolveCredential,
    rejectCredential,
  });
  const client = await createBuiltInMcpClient('feishu', 'grant-user', new AbortController().signal);
  try {
    await client.listTools();
    mockFetch.mockImplementation((url, init) => {
      if (init?.body && JSON.parse(init.body).method === 'tools/call')
        return new Response('private-rejected-token', { status: 401 });
      return respond(url, init);
    });
    await expect(client.callTool({ name: 'create-doc', args: {} })).rejects.toMatchObject({
      reason: 'authorization',
    });
    expect(rejectCredential).toHaveBeenCalledWith('grant-user', userCredential);
    expect(toolRequests()).toHaveLength(1);
  } finally {
    await client.close();
  }
});

it('injects the latest GitHub user credential for each independent request without putting it in SDK configuration', async () => {
  const credential = {
    version: 1,
    application: {
      clientId: 'cherry_oauth_client',
      clientSecret: 'public-client-secret',
      redirectUrl: 'cherrystudio-dev://plugins/github/callback',
    },
    account: { id: '42', login: 'cherry' },
    tokens: { accessToken: 'github-access', refreshToken: 'github-refresh' },
  };
  mockGetGrant.mockResolvedValue({ id: 'github-grant', authMethod: 'github_user' });
  mockResolveCredential.mockResolvedValue(credential);
  const client = await createBuiltInMcpClient(
    'github',
    'github-grant',
    new AbortController().signal,
  );
  try {
    await settle();
    mockResolveCredential.mockResolvedValue({
      ...credential,
      tokens: { ...credential.tokens, accessToken: 'new-github-access' },
    });
    mockFetch.mockClear();
    await client.listTools();
    expect(new Headers(mockFetch.mock.calls[0][1].headers).get('Authorization')).toBe(
      'Bearer new-github-access',
    );
    expect(JSON.stringify(jest.mocked(mcp.createMCPClient).mock.calls[0][0])).not.toMatch(
      /github-access|github-refresh|public-client-secret/,
    );
  } finally {
    await client.close();
  }
});
