import { TransformStream as NodeTransformStream } from 'node:stream/web';

import {
  Client,
  InsufficientScopeError,
  SdkErrorCode,
  SdkHttpError,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

import { McpLegacyFallbackError } from '@/shared/contracts/mcp';
import { readMcpFailureFacts } from '@/shared/data/api/mcpFailureFacts';

import { normalizeMcpConnectionFailure } from '../mcpConnectionFailure';
import { createRemoteMcpClient } from '../mcpProtocolClient';

jest.mock('@modelcontextprotocol/client', () => {
  // The parser subclasses TransformStream at module evaluation time.
  Object.assign(globalThis, jest.requireActual('node:stream/web'));
  return jest.requireActual('@modelcontextprotocol/client');
});

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

it('observes each outbound handshake before fetch and preserves both fallback facts', async () => {
  fixture('500', 'unsupported');
  const fetch = mockFetch.getMockImplementation()!;
  let stage: string | undefined;
  mockFetch.mockImplementation((url: string, init: RequestInit) => {
    const method = init.body ? JSON.parse(String(init.body)).method : undefined;
    if (method === 'server/discover') expect(stage).toBe('negotiation');
    if (method === 'initialize') expect(stage).toBe('initialize');
    return fetch(url, init);
  });
  const error = await createRemoteMcpClient({
    config: { endpointUrl: 'https://example.com/mcp' },
    signal: new AbortController().signal,
    foreground: false,
    authorization: { token: jest.fn(), rejected: jest.fn() },
    onConnectionStage: (value) => {
      stage = value;
    },
  }).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(McpLegacyFallbackError);
  expect(
    normalizeMcpConnectionFailure(error, {
      stage: 'tools-list',
      didTimeout: false,
      timeoutMs: 15000,
    }),
  ).toEqual({
    stage: 'initialize',
    kind: 'http-status',
    httpStatus: 400,
    fallback: {
      negotiation: { stage: 'negotiation', kind: 'http-status', httpStatus: 500 },
      legacy: { stage: 'initialize', kind: 'http-status', httpStatus: 400 },
    },
  });
});

it.each(['socket', 'silence'] as const)(
  'keeps a real SDK SSE %s outcome when the SDK deadline discards the stream error',
  async (outcome) => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const snapshots: import('@/shared/contracts/mcp').McpConnectionFailure[] = [];
    const socketError = Object.freeze(new TypeError('Bearer private socket details'));
    try {
      mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
        if (init.method === 'DELETE') return new Response(null, { status: 200 });
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            if (outcome === 'socket') {
              controller.enqueue(new TextEncoder().encode(': stream opened\n\n'));
              // Deliver bytes before failing the next read, as a real socket does.
              setTimeout(() => controller.error(socketError), 1);
            }
          },
        });
        const response = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
        Object.defineProperty(response, 'body', { value: body, configurable: true });
        return response;
      });
      const result = createRemoteMcpClient({
        config: { endpointUrl: 'https://example.com/mcp' },
        signal: new AbortController().signal,
        foreground: false,
        authorization: { token: jest.fn(), rejected: jest.fn() },
        onConnectionFailure: (facts) => snapshots.push(facts),
      }).catch((error: unknown) => error);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await jest.advanceTimersByTimeAsync(outcome === 'socket' ? 30_000 : 15_000);
      const error = await result;
      if (outcome === 'socket') {
        expect(error).toBeInstanceOf(McpLegacyFallbackError);
        expect(snapshots.at(-1)).toEqual({
          stage: 'initialize',
          kind: 'refused-or-unreachable',
          fallback: {
            negotiation: { stage: 'negotiation', kind: 'refused-or-unreachable' },
            legacy: { stage: 'initialize', kind: 'refused-or-unreachable' },
          },
        });
        expect(JSON.stringify(snapshots)).not.toMatch(/Bearer|private|socket details/);
      } else {
        expect(error).toMatchObject({ code: SdkErrorCode.RequestTimeout });
        expect(snapshots.at(-1)).toEqual({
          stage: 'negotiation',
          kind: 'timeout',
          timeoutMs: 15_000,
        });
      }
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  },
);

it('ignores a completed discovery stream failure while initialization silently times out', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  const methods: string[] = [];
  const failures = jest.fn();
  const transportErrors: Error[] = [];
  const originalStart = StreamableHTTPClientTransport.prototype.start;
  const start = jest
    .spyOn(StreamableHTTPClientTransport.prototype, 'start')
    .mockImplementation(function (this: StreamableHTTPClientTransport) {
      const previous = this.onerror;
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MCP transport callback, not an EventTarget.
      this.onerror = (error) => {
        transportErrors.push(error);
        previous?.(error);
      };
      return originalStart.call(this);
    });
  let discovery!: ReadableStreamDefaultController<Uint8Array>;
  try {
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      if (init.method === 'DELETE') return new Response(null, { status: 200 });
      const request = JSON.parse(String(init.body));
      methods.push(request.method);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (request.method !== 'server/discover') return;
          discovery = controller;
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                error: { code: -32601, message: 'legacy only' },
              })}\n\n`,
            ),
          );
        },
      });
      const response = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
      Object.defineProperty(response, 'body', { value: stream, configurable: true });
      return response;
    });
    const result = createRemoteMcpClient({
      config: { endpointUrl: 'https://example.com/mcp' },
      signal: new AbortController().signal,
      foreground: false,
      authorization: { token: jest.fn(), rejected: jest.fn() },
      onConnectionFailure: failures,
    }).catch((error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(methods).toEqual(['server/discover', 'initialize']);
    expect(transportErrors).toEqual([]);
    discovery.error(new TypeError('late discovery socket failure'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await jest.advanceTimersByTimeAsync(30_000);
    const error = await result;
    expect(error).not.toBeInstanceOf(McpLegacyFallbackError);
    expect(error).toMatchObject({ code: SdkErrorCode.RequestTimeout });
    expect(methods).toEqual(['server/discover', 'initialize']);
    expect(failures.mock.calls).toEqual([
      [{ stage: 'initialize', kind: 'timeout', timeoutMs: 15_000 }],
    ]);
  } finally {
    start.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it.each(['primitive fetch rejection', null, undefined])(
  'publishes one real SDK negotiation failure for a primitive fetch rejection: %p',
  async (rejection) => {
    mockFetch.mockRejectedValue(rejection);
    const failures = jest.fn();
    const stages = jest.fn();
    await expect(
      createRemoteMcpClient({
        config: { endpointUrl: 'https://example.com/mcp' },
        signal: new AbortController().signal,
        foreground: false,
        authorization: { token: jest.fn(), rejected: jest.fn() },
        onConnectionFailure: failures,
        onConnectionStage: stages,
      }),
    ).rejects.toBeInstanceOf(McpLegacyFallbackError);
    expect(failures.mock.calls.map(([facts]) => facts)).toEqual([
      { stage: 'negotiation', kind: 'unknown' },
      {
        // Both attempts are unknown, so the existing policy retains the negotiation detail.
        stage: 'negotiation',
        kind: 'unknown',
        fallback: {
          negotiation: { stage: 'negotiation', kind: 'unknown' },
          legacy: { stage: 'initialize', kind: 'unknown' },
        },
      },
    ]);
    expect(stages.mock.calls.map(([stage]) => stage)).toEqual(['negotiation', 'initialize']);
  },
);

it('releases observers after four real SDK 401 tool-list responses without closing the client', async () => {
  fixture('modern');
  const fetch = mockFetch.getMockImplementation()!;
  mockFetch.mockImplementation((url: string, init: RequestInit) => {
    if (init.body && JSON.parse(String(init.body)).method === 'tools/list')
      return Promise.resolve(new Response(null, { status: 401 }));
    return fetch(url, init);
  });
  const client = await createRemoteMcpClient({
    config: { endpointUrl: 'https://example.com/mcp' },
    signal: new AbortController().signal,
    foreground: false,
    authorization: { token: jest.fn(async () => 'expired'), rejected: jest.fn() },
  });
  const close = jest.spyOn(client, 'close');
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const add = jest.spyOn(AbortSignal.prototype, 'addEventListener');
  const remove = jest.spyOn(AbortSignal.prototype, 'removeEventListener');
  const originalAdd = add.getMockImplementation()!;
  const originalRemove = remove.getMockImplementation()!;
  add.mockImplementation(function (this: AbortSignal, type, listener, options) {
    if (type === 'abort') listeners.add(listener);
    return originalAdd.call(this, type, listener, options);
  });
  remove.mockImplementation(function (this: AbortSignal, type, listener, options) {
    if (type === 'abort') listeners.delete(listener);
    return originalRemove.call(this, type, listener, options);
  });
  try {
    for (let request = 0; request < 4; request += 1) {
      await expect(client.listTools()).rejects.toBeDefined();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(listeners.size).toBe(0);
    }
    expect(close).not.toHaveBeenCalled();
  } finally {
    add.mockRestore();
    remove.mockRestore();
    await client.close();
  }
});

it('settles an oversized real SDK negotiation SSE response with size-limit facts', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  const failures = jest.fn();
  try {
    mockFetch.mockImplementation(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
        },
      });
      const response = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
      Object.defineProperty(response, 'body', { value: body, configurable: true });
      return response;
    });
    const result = createRemoteMcpClient({
      config: { endpointUrl: 'https://example.com/mcp' },
      signal: new AbortController().signal,
      foreground: false,
      authorization: { token: jest.fn(), rejected: jest.fn() },
      onConnectionFailure: failures,
    }).catch((error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(failures.mock.calls).toEqual([[{ stage: 'negotiation', kind: 'size-limit' }]]);
    const error = await result;
    expect(
      normalizeMcpConnectionFailure(error, {
        stage: 'negotiation',
        didTimeout: false,
        timeoutMs: 15_000,
      }),
    ).toEqual({ stage: 'negotiation', kind: 'size-limit' });
    expect(failures.mock.calls).toEqual([[{ stage: 'negotiation', kind: 'size-limit' }]]);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it.each(['modern', '500'] as const)(
  'routes a real SDK tools/list SSE socket failure to its own call after a %s probe',
  async (probe) => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    fixture(probe);
    const fetch = mockFetch.getMockImplementation()!;
    const socketError = Object.freeze(new TypeError('Bearer private socket details'));
    const failures = jest.fn();
    const listFailure = jest.fn();
    const siblingFailure = jest.fn();
    let failedStream!: ReadableStreamDefaultController<Uint8Array>;
    let listRequests = 0;
    mockFetch.mockImplementation((url: string, init: RequestInit) => {
      if (init.body && JSON.parse(String(init.body)).method === 'tools/list') {
        listRequests += 1;
        if (listRequests === 1) {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              failedStream = controller;
              controller.enqueue(new TextEncoder().encode(': stream opened\n\n'));
            },
          });
          const response = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
          Object.defineProperty(response, 'body', { value: body, configurable: true });
          return Promise.resolve(response);
        }
        // A concurrent silent request must keep its own timeout facts.
        return new Promise<Response>(() => {});
      }
      return fetch(url, init);
    });
    const client = await createRemoteMcpClient({
      config: { endpointUrl: 'https://example.com/mcp' },
      signal: new AbortController().signal,
      foreground: false,
      authorization: { token: jest.fn(), rejected: jest.fn() },
      onConnectionFailure: failures,
    });
    try {
      failures.mockClear();
      const result = client.listTools({ onFailure: listFailure }).catch((error: unknown) => error);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const sibling = client
        .listTools({ onFailure: siblingFailure })
        .catch((error: unknown) => error);
      await new Promise<void>((resolve) => setImmediate(resolve));
      failedStream.error(socketError);
      await new Promise<void>((resolve) => setImmediate(resolve));
      // Drain the SDK dispatch turn; an unanswered request must still fail before its deadline.
      await jest.advanceTimersByTimeAsync(0);
      const facts = { stage: 'tools-list', kind: 'refused-or-unreachable' };
      expect(listFailure.mock.calls).toEqual([[facts]]);
      const error = await result;
      expect(error).toBeInstanceOf(TypeError);
      expect(error).not.toBe(socketError);
      expect(readMcpFailureFacts(error)).toEqual(facts);
      expect(readMcpFailureFacts(socketError)).toBeUndefined();
      expect(JSON.stringify(readMcpFailureFacts(error))).not.toMatch(
        /Bearer|private|socket details/,
      );
      await jest.advanceTimersByTimeAsync(60_000);
      expect(await sibling).toMatchObject({ code: SdkErrorCode.RequestTimeout });
      expect(siblingFailure.mock.calls).toEqual([[{ stage: 'tools-list', kind: 'timeout' }]]);
    } finally {
      await client.close();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  },
);

it('publishes live real SDK SSE failures after the legacy fallback connects', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  fixture('500');
  const fetch = mockFetch.getMockImplementation()!;
  const failures = jest.fn();
  mockFetch.mockImplementation((url: string, init: RequestInit) => {
    if (init.body && JSON.parse(String(init.body)).method === 'tools/list') {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(': stream opened\n\n'));
          setTimeout(() => controller.error(new TypeError('socket closed')), 1);
        },
      });
      const response = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
      Object.defineProperty(response, 'body', { value: body, configurable: true });
      return Promise.resolve(response);
    }
    return fetch(url, init);
  });
  const client = await createRemoteMcpClient({
    config: { endpointUrl: 'https://example.com/mcp' },
    signal: new AbortController().signal,
    foreground: false,
    authorization: { token: jest.fn(), rejected: jest.fn() },
    onConnectionFailure: failures,
  });
  try {
    expect(failures.mock.calls).toEqual([
      [{ stage: 'negotiation', kind: 'http-status', httpStatus: 500 }],
    ]);
    failures.mockClear();
    const result = client.listTools().catch((error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    // Include the dispatch turn after the socket error, while staying before the SDK deadline.
    await jest.advanceTimersByTimeAsync(2);
    expect(failures.mock.calls).toEqual([
      [{ stage: 'tools-list', kind: 'refused-or-unreachable' }],
    ]);
    await result;
  } finally {
    await client.close();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it.each(['server/discover', 'tools/list'] as const)(
  'keeps a complete real SDK %s response successful when the next stream read errors',
  async (method) => {
    const methods = fixture('modern', true);
    const fetch = mockFetch.getMockImplementation()!;
    const failures = jest.fn();
    const listFailure = jest.fn();
    const preference = jest.fn();
    const socketError = new TypeError('late socket failure');
    let didReadResponse = false;
    let didError = false;
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      const response = await fetch(url, init);
      if (!init.body || JSON.parse(String(init.body)).method !== method) return response;
      const payload = await response.text();
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!didReadResponse) {
            didReadResponse = true;
            controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
          } else {
            didError = true;
            controller.error(socketError);
          }
        },
      });
      const sse = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
      Object.defineProperty(sse, 'body', { value: body, configurable: true });
      return sse;
    });
    const client = await createRemoteMcpClient({
      config: { endpointUrl: 'https://example.com/mcp' },
      signal: new AbortController().signal,
      foreground: false,
      authorization: { token: jest.fn(), rejected: jest.fn() },
      onConnectionFailure: failures,
      onLegacyPreferenceChanged: preference,
    });
    try {
      expect(client.serverInfo).toEqual({ name: 'fixture', version: '1' });
      expect((await client.listTools({ onFailure: listFailure })).tools).toHaveLength(67);
      // Allow the late error observer to run even if the SDK has already returned success.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(didReadResponse).toBe(true);
      expect(didError).toBe(true);
      expect(failures).not.toHaveBeenCalled();
      expect(listFailure).not.toHaveBeenCalled();
      expect(methods).toEqual(['server/discover', 'tools/list']);
      expect(preference).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  },
);

it.each(['abort', 'close fallback'] as const)(
  'does not publish a real SDK connection failure when intentional %s cancels a pending tools/list',
  async (action) => {
    fixture(action === 'abort' ? 'modern' : '500');
    const fetch = mockFetch.getMockImplementation()!;
    const failures = jest.fn();
    const abort = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    mockFetch.mockImplementation((url: string, init: RequestInit) => {
      if (!init.body || JSON.parse(String(init.body)).method !== 'tools/list')
        return fetch(url, init);
      requestSignal = init.signal!;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason), {
          once: true,
        });
        started();
      });
    });
    const client = await createRemoteMcpClient({
      config: { endpointUrl: 'https://example.com/mcp' },
      signal: new AbortController().signal,
      foreground: false,
      authorization: { token: jest.fn(), rejected: jest.fn() },
      onConnectionFailure: failures,
    });
    try {
      failures.mockClear();
      const result = client
        .listTools({ options: { signal: abort.signal } })
        .catch((error: unknown) => error);
      await requestStarted;
      if (action === 'abort') abort.abort();
      else await client.close();
      const error = await result;
      // Preserve the SDK's existing abort wrapping, including its RequestTimeout code.
      if (action === 'abort')
        expect(error).toMatchObject({
          code: SdkErrorCode.RequestTimeout,
          message: String(abort.signal.reason),
        });
      else expect(error).toMatchObject({ code: SdkErrorCode.ConnectionClosed });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(requestSignal?.aborted).toBe(true);
      expect(failures).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  },
);
