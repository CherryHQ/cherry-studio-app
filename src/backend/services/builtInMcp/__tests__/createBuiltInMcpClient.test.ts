import * as mcp from '@ai-sdk/mcp';

import {
  createBuiltInMcpClient,
  isBuiltInMcpToolAllowed,
  validatePluginCredential,
} from '../createBuiltInMcpClient';

const mockFetch = jest.fn();
const mockGetGrant = jest.fn();
const mockTokenRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (...args: unknown[]) => mockTokenRequest(...args) }),
  isHttpError: () => false,
}));
jest.mock('@ai-sdk/mcp', () => {
  const actual = jest.requireActual<typeof mcp>('@ai-sdk/mcp');
  return { ...actual, createMCPClient: jest.fn(actual.createMCPClient) };
});
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('@/backend/data/services/PluginAuthorizationService', () => ({
  pluginAuthorizationService: {
    getCredentialGrant: (...args: unknown[]) => mockGetGrant(...args),
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

beforeEach(() => {
  jest.mocked(mcp.createMCPClient).mockClear();
  mockFetch.mockReset().mockImplementation(respond);
  mockGetGrant.mockReset().mockImplementation(async (pluginId: string) => ({
    credential: 'private-key',
    authMethod: pluginId === 'amap' ? 'api_key' : 'personal_token',
  }));
  mockTokenRequest.mockReset().mockResolvedValue({
    data: { code: 0, tenant_access_token: 'private-tenant-token', expire: 7200 },
  });
});
afterEach(() => jest.restoreAllMocks());

const feishuCredential = JSON.stringify({ appId: 'cli_cherry', appSecret: 'private-app-secret' });

it('connects Feishu as the application without storing credentials in MCP configuration or calling business tools', async () => {
  await expect(validatePluginCredential('feishu', feishuCredential)).resolves.toBe('cli_cherry');
  expect(toolRequests()).toEqual([]);
  expect(mockTokenRequest).toHaveBeenCalledTimes(1);
  expect(mockTokenRequest.mock.calls[0][0]).toMatchObject({
    method: 'POST',
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    body: { app_id: 'cli_cherry', app_secret: 'private-app-secret' },
    redirect: 'error',
  });
  const config = jest.mocked(mcp.createMCPClient).mock.calls[0][0];
  expect(JSON.stringify(config)).not.toMatch(/private-app-secret|private-tenant-token/);
  for (const [url, init] of mockFetch.mock.calls as [string, RequestInit][]) {
    const headers = new Headers(init.headers);
    expect(url).toBe('https://mcp.feishu.cn/mcp');
    expect(headers.get('X-Lark-MCP-TAT')).toBe('private-tenant-token');
    expect(headers.get('X-Lark-MCP-Allowed-Tools')?.split(',')).toContain('create-doc');
    expect(headers.has('X-Lark-MCP-UAT')).toBe(false);
    expect(headers.has('Authorization')).toBe(false);
    expect(init.redirect).toBe('error');
    expect(JSON.stringify(init)).not.toContain('private-app-secret');
  }
  expect(isBuiltInMcpToolAllowed('feishu', 'search-doc')).toBe(false);
  expect(isBuiltInMcpToolAllowed('feishu', 'search-user')).toBe(false);
});

it('rechecks a Feishu grant after token exchange and prevents a revoked grant from sending a cloud request', async () => {
  mockGetGrant.mockResolvedValue({ credential: feishuCredential, authMethod: 'app_credentials' });
  mockTokenRequest.mockImplementation(async () => {
    mockGetGrant.mockRejectedValue(new Error('revoked'));
    return { data: { code: 0, tenant_access_token: 'private-tenant-token', expire: 7200 } };
  });
  await expect(
    createBuiltInMcpClient('feishu', 'grant-feishu', new AbortController().signal),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(mockFetch).not.toHaveBeenCalled();
});

it('keeps cached Feishu tokens subject to grant revocation', async () => {
  mockGetGrant.mockResolvedValue({ credential: feishuCredential, authMethod: 'app_credentials' });
  const client = await createBuiltInMcpClient(
    'feishu',
    'grant-feishu',
    new AbortController().signal,
  );
  try {
    await client.listTools();
    expect(mockTokenRequest).toHaveBeenCalledTimes(1);
    mockGetGrant.mockRejectedValue(new Error('revoked'));
    mockFetch.mockClear();
    await expect(client.listTools()).rejects.toMatchObject({ reason: 'authorization' });
    expect(mockFetch).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it('does not replay a Feishu write after an expired token response', async () => {
  mockGetGrant.mockResolvedValue({ credential: feishuCredential, authMethod: 'app_credentials' });
  const client = await createBuiltInMcpClient(
    'feishu',
    'grant-feishu',
    new AbortController().signal,
  );
  try {
    const tools = await client.tools();
    mockFetch.mockImplementation((url, init) => {
      if (init?.body && JSON.parse(init.body).method === 'tools/call')
        return new Response('private-tenant-token', { status: 401 });
      return respond(url, init);
    });
    await expect(
      tools['create-doc'].execute({}, { toolCallId: 'write', messages: [] }),
    ).rejects.toMatchObject({ reason: 'authorization' });
    expect(toolRequests()).toHaveLength(1);
    expect(mockTokenRequest).toHaveBeenCalledTimes(1);
    // A later independent request can obtain a new token, without replaying the failed write.
    await client.listTools();
    expect(mockTokenRequest).toHaveBeenCalledTimes(2);
    expect(toolRequests()).toHaveLength(1);
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
      const tools = await client.tools();
      mockFetch.mockImplementation((url, init) => {
        if (init?.body && JSON.parse(init.body).method === 'tools/call') {
          return new Response('private-key upstream stack', { status });
        }
        return respond(url, init);
      });
      const error = await Promise.resolve(
        tools.issue_write.execute({ method: 'create' }, { toolCallId: 'write', messages: [] }),
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
    const tools = await client.tools();
    mockFetch.mockImplementation((url, init) => {
      if (init?.body && JSON.parse(init.body).method === 'tools/call')
        throw new Error('private-key');
      return respond(url, init);
    });
    await expect(
      tools.issue_write.execute({ method: 'create' }, { toolCallId: 'write', messages: [] }),
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
      return { credential: 'private-key', authMethod: 'personal_token' };
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
    await expect(validatePluginCredential(pluginId, 'entered-key')).resolves.toBe(label);
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
  const error = await validatePluginCredential('amap', 'entered-key').catch(
    (value: unknown) => value,
  );
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
  await expect(validatePluginCredential('github', 'entered-key')).resolves.toBe('cherry');
});

it.each([undefined, 'repeated'])(
  'rejects missing validation tools with cursor %s instead of accepting an unverified grant',
  async (nextCursor) => {
    mockFetch.mockImplementation((url, init) => {
      const request: RpcRequest | undefined = init?.body ? JSON.parse(init.body) : undefined;
      if (request?.method === 'tools/list') return reply(request, { tools: [], nextCursor });
      return respond(url, init);
    });
    await expect(validatePluginCredential('github', 'entered-key')).rejects.toMatchObject({
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
  await expect(validatePluginCredential('amap', 'entered-key')).rejects.toMatchObject({
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
  mockGetGrant.mockResolvedValue({ credential: 'private-key', authMethod: 'future_method_v2' });
  await expect(
    createBuiltInMcpClient('github', 'grant', new AbortController().signal),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(mockFetch).not.toHaveBeenCalled();
});
