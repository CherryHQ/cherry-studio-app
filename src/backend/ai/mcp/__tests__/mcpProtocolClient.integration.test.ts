import { TransformStream as NodeTransformStream } from 'node:stream/web';

import {
  Client,
  InsufficientScopeError,
  SdkErrorCode,
  SdkHttpError,
} from '@modelcontextprotocol/client';

import { McpLegacyFallbackError } from '@/shared/contracts/mcp';

import { createRemoteMcpClient } from '../mcpProtocolClient';

const mockFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));

globalThis.TransformStream = NodeTransformStream as typeof TransformStream;

function fixture(
  probe: '500' | 'network' | 'html' | 'unrecognized' | 'modern' | 'silent',
  legacyFails: boolean | 'unsupported' | 401 | 403 | 'insufficient_scope' = false,
) {
  const methods: string[] = [];
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    if (init.method === 'DELETE') return new Response(null, { status: 200 });
    const request = JSON.parse(String(init.body));
    methods.push(request.method);
    if (request.method === 'server/discover') {
      if (probe === 'silent') return new Promise<Response>(() => {});
      if (probe === 'modern')
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              supportedVersions: ['2026-07-28'],
              capabilities: { tools: {} },
              _meta: {
                'io.modelcontextprotocol/serverInfo': { name: 'fixture', version: '1' },
              },
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      if (probe === 'network') throw new TypeError('socket closed');
      if (probe === '500') return new Response('error', { status: 500 });
      if (probe === 'html')
        return new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } });
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: 'unknown' },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    if (request.method === 'initialize' && legacyFails === 'unsupported')
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32022,
            message: 'Unsupported protocol version',
            data: { supported: ['2026-07-28'] },
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    if (request.method === 'initialize' && legacyFails === 'insufficient_scope')
      return new Response('error', {
        status: 403,
        headers: { 'www-authenticate': 'Bearer error="insufficient_scope", scope="tools:read"' },
      });
    if (request.method === 'initialize' && legacyFails)
      return new Response('error', {
        status: typeof legacyFails === 'number' ? legacyFails : 500,
      });
    const result =
      request.method === 'initialize'
        ? {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'fixture', version: '1' },
          }
        : {
            ...(probe === 'modern'
              ? { resultType: 'complete', ttlMs: 60_000, cacheScope: 'private' }
              : {}),
            tools: Array.from({ length: 67 }, (_, i) => ({
              name: `tool_${i}`,
              inputSchema: { type: 'object' },
            })),
          };
    if (request.id === undefined) return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return methods;
}

function open(onLegacyPreferenceChanged = jest.fn(), shouldUseLegacyProtocol = false) {
  return createRemoteMcpClient({
    config: { endpointUrl: 'https://example.com/mcp' },
    signal: new AbortController().signal,
    foreground: false,
    authorization: { token: jest.fn(), rejected: jest.fn() },
    onLegacyPreferenceChanged,
    shouldUseLegacyProtocol,
  });
}

it.each(['500', 'network', 'html'] as const)(
  'recovers from a %s probe with a usable legacy client',
  async (probe) => {
    const methods = fixture(probe);
    const callback = jest.fn();
    const client = await open(callback);
    expect((await client.listTools()).tools).toHaveLength(67);
    expect(
      methods.filter((method) => method === 'server/discover' || method === 'initialize'),
    ).toEqual(['server/discover', 'initialize']);
    expect(callback).toHaveBeenCalledTimes(1);
    await client.close();
  },
);

it('leaves SDK internal legacy negotiation alone', async () => {
  const methods = fixture('unrecognized');
  const callback = jest.fn();
  const client = await open(callback);
  expect((await client.listTools()).tools).toHaveLength(67);
  expect(
    methods.filter((method) => method === 'server/discover' || method === 'initialize'),
  ).toEqual(['server/discover', 'initialize']);
  expect(callback).not.toHaveBeenCalled();
  await client.close();
});

it.each([
  [401, false],
  [403, false],
  ['insufficient_scope', false],
  [401, true],
  [403, true],
  ['insufficient_scope', true],
] as const)(
  'preserves a legacy %s rejection with cached preference %s',
  async (legacyFailure, shouldUseLegacyProtocol) => {
    const methods = fixture('500', legacyFailure);
    const callback = jest.fn();
    const error = await createRemoteMcpClient({
      config: {
        endpointUrl: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer expired-static-token' },
      },
      signal: new AbortController().signal,
      foreground: false,
      authorization: { token: jest.fn(), rejected: jest.fn() },
      onLegacyPreferenceChanged: callback,
      shouldUseLegacyProtocol,
    }).catch((value: unknown) => value);
    if (legacyFailure === 'insufficient_scope') {
      expect(error).toBeInstanceOf(InsufficientScopeError);
      expect(error).toMatchObject({ requiredScope: 'tools:read' });
    } else {
      expect(error).toBeInstanceOf(SdkHttpError);
      expect(error).toMatchObject({
        code: SdkErrorCode.ClientHttpNotImplemented,
        status: legacyFailure,
      });
    }
    expect(
      methods.filter((method) => method === 'server/discover' || method === 'initialize'),
    ).toEqual(shouldUseLegacyProtocol ? ['initialize'] : ['server/discover', 'initialize']);
    expect(callback).not.toHaveBeenCalled();
  },
);

it('retains both failures without exposing upstream messages', async () => {
  fixture('500', true);
  const callback = jest.fn();
  const error = await open(callback).catch((value: unknown) => value);
  expect(error).toBeInstanceOf(McpLegacyFallbackError);
  expect(error).toMatchObject({
    message: 'MCP protocol negotiation and the legacy connection attempt both failed.',
    negotiationError: expect.any(Error),
    cause: expect.any(Error),
  });
  expect(callback).not.toHaveBeenCalled();
});

it('connects through modern discovery without an explicit legacy fallback', async () => {
  const methods = fixture('modern');
  const callback = jest.fn();
  const serverVersion = jest.spyOn(Client.prototype, 'getServerVersion');
  try {
    const client = await open(callback);
    try {
      expect(serverVersion).toHaveLastReturnedWith({ name: 'fixture', version: '1' });
      expect(client.serverInfo).toEqual({ name: 'fixture', version: '1' });
      expect(client.protocolInfo?.version).toBe('2026-07-28');
      expect((await client.listTools()).tools).toHaveLength(67);
      expect(methods.filter((method) => method === 'server/discover')).toHaveLength(1);
      expect(methods.filter((method) => method === 'tools/list')).toHaveLength(1);
      expect(methods).not.toContain('initialize');
      expect(callback).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  } finally {
    serverVersion.mockRestore();
  }
});

it('recovers a cached legacy connection after the server switches to modern only', async () => {
  const methods = fixture('modern', 'unsupported');
  const callback = jest.fn();
  const client = await open(callback, true);
  try {
    expect(client.protocolInfo?.version).toBe('2026-07-28');
    expect((await client.listTools()).tools).toHaveLength(67);
    expect(
      methods.filter((method) => method === 'initialize' || method === 'server/discover'),
    ).toEqual(['initialize', 'server/discover']);
    expect(callback.mock.calls).toEqual([[false]]);
  } finally {
    await client.close();
  }
});

it('preserves REQUEST_TIMEOUT for a silent probe without an explicit legacy fallback', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  try {
    const methods = fixture('silent');
    const callback = jest.fn();
    const connection = open(callback);
    const assertion = expect(connection).rejects.toMatchObject({
      code: SdkErrorCode.RequestTimeout,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(methods).toEqual(['server/discover']);
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(methods.filter((method) => method === 'server/discover')).toHaveLength(1);
    expect(methods).not.toContain('initialize');
    expect(callback).not.toHaveBeenCalled();
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it('closes the connected legacy client when fallback publication throws', async () => {
  const methods = fixture('500');
  const publicationError = new Error('publication failed');
  const callback = jest.fn(() => {
    throw publicationError;
  });
  const originalClose = Client.prototype.close;
  const closedIdentities: ReturnType<Client['getServerVersion']>[] = [];
  const close = jest.spyOn(Client.prototype, 'close').mockImplementation(function (this: Client) {
    closedIdentities.push(this.getServerVersion());
    return originalClose.call(this);
  });
  try {
    await expect(open(callback)).rejects.toBe(publicationError);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(methods.filter((method) => method === 'initialize')).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(2);
    expect(closedIdentities[1]).toEqual({ name: 'fixture', version: '1' });
  } finally {
    close.mockRestore();
  }
});
