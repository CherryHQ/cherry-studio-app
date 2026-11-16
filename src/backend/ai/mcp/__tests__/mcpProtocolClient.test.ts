import { ProtocolError, SdkError, SdkErrorCode, SdkHttpError } from '@modelcontextprotocol/client';

import {
  McpAuthorizationError,
  McpLegacyFallbackError,
  McpRedirectError,
} from '@/shared/contracts/mcp';
import { readMcpFailureFacts } from '@/shared/data/api/mcpFailureFacts';

import {
  formatMcpConnectionFailureSummary,
  normalizeMcpConnectionFailure,
} from '../mcpConnectionFailure';
import { classifyMcpCallRejection, createRemoteMcpClient } from '../mcpProtocolClient';

const mockTool = { name: 'write', inputSchema: { type: 'object' } };
const mockCall = jest.fn();
const mockClose = jest.fn(async () => {});
const mockConnect = jest.fn(async () => {});
const mockExpoFetch = jest.fn();
let mockOptions: Record<string, unknown>;
const mockAttempts: { options: Record<string, unknown>; close: jest.Mock }[] = [];
let mockTransport: {
  fetch: typeof fetch;
  authProvider?: unknown;
  onInsufficientScope?: unknown;
  requestInit?: RequestInit;
};
let mockHandler: (
  request: { params: unknown },
  context: { mcpReq: { signal: AbortSignal } },
) => Promise<unknown>;
let mockListResult: object;

jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));
jest.mock('@modelcontextprotocol/client', () => ({
  ...jest.requireActual('@modelcontextprotocol/client'),
  Client: class {
    constructor(_info: unknown, options: Record<string, unknown>) {
      mockOptions = options;
      mockAttempts.push({ options, close: this.close });
    }
    connect = mockConnect;
    close = jest.fn(async () => mockClose());
    getServerVersion = () => ({ name: 'Server', version: '1' });
    getServerCapabilities = () => ({ tools: {}, resources: {}, prompts: {} });
    getProtocolEra = () => 'modern';
    setRequestHandler = (_method: string, handler: typeof mockHandler) => {
      mockHandler = handler;
    };
    listTools = async () => mockListResult;
    callTool = mockCall;
    listResources = async () => ({ resources: [] });
    listResourceTemplates = async () => ({ resourceTemplates: [] });
    readResource = async () => ({ contents: [] });
    listPrompts = async () => ({ prompts: [] });
    getPrompt = async () => ({ messages: [] });
  },
  StreamableHTTPClientTransport: class {
    protocolVersion = '2026-07-28';
    constructor(_url: URL, options: typeof mockTransport) {
      mockTransport = options;
    }
  },
}));

const endpointUrl = 'https://mcp.example/mcp';
const mockFailure = jest.fn();
const authorization = { token: jest.fn(), rejected: jest.fn() };
function open(elicit?: Parameters<typeof createRemoteMcpClient>[0]['elicit']) {
  return createRemoteMcpClient({
    config: { endpointUrl },
    signal: new AbortController().signal,
    foreground: true,
    authorization,
    onConnectionFailure: mockFailure,
    elicit,
  });
}

function streamingResponse(body: ReadableStream<Uint8Array>, contentType: string) {
  const response = new Response(null, { headers: { 'content-type': contentType } });
  // Expo's response creates its body with the runtime's stream implementation.
  Object.defineProperty(response, 'body', { value: body, configurable: true });
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAttempts.length = 0;
  mockListResult = { tools: [mockTool], ttlMs: 1000 };
  mockCall.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });
  authorization.token.mockResolvedValue(undefined);
});

describe('native MCP protocol boundary', () => {
  it('ignores a stream observation after its request is cancelled', async () => {
    const client = await open();
    const cancel = new AbortController();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    mockExpoFetch.mockResolvedValueOnce(
      streamingResponse(
        new ReadableStream({
          start(controller) {
            source = controller;
          },
        }),
        'text/event-stream',
      ),
    );
    try {
      await mockTransport.fetch(endpointUrl, {
        method: 'POST',
        signal: cancel.signal,
        body: JSON.stringify({ method: 'tools/list', id: 1 }),
      });
      cancel.abort();
      source.error(new TypeError('late cancellation socket'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(mockFailure).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });

  it.each([
    'primitive socket',
    null,
    undefined,
    new TypeError('socket'),
    new SdkError(SdkErrorCode.RequestTimeout, 'timeout'),
  ])(
    'publishes one connection failure when fetch and connection reject with the same cause: %p',
    async (error) => {
      mockExpoFetch.mockRejectedValueOnce(error);
      mockConnect.mockImplementationOnce(async () => {
        await mockTransport.fetch(endpointUrl, {
          method: 'POST',
          body: JSON.stringify({ method: 'initialize', id: 1 }),
        });
      });
      await expect(open()).rejects.toBe(error);
      expect(mockFailure).toHaveBeenCalledTimes(1);
    },
  );

  it('publishes each fallback failure once even when the observer always throws', async () => {
    const negotiation = new SdkError(SdkErrorCode.EraNegotiationFailed, 'negotiation');
    const legacy = new TypeError('legacy socket');
    mockFailure.mockImplementation(() => {
      throw new Error('observer');
    });
    mockConnect.mockRejectedValueOnce(negotiation).mockImplementationOnce(async () => {
      mockExpoFetch.mockRejectedValueOnce(legacy);
      await mockTransport.fetch(endpointUrl, {
        method: 'POST',
        body: JSON.stringify({ method: 'initialize', id: 1 }),
      });
    });
    try {
      const error = await open().catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(McpLegacyFallbackError);
      expect((error as McpLegacyFallbackError).negotiationError).toBe(negotiation);
      expect((error as McpLegacyFallbackError).cause).toBe(legacy);
      // Include unknown failures: pending stages must never masquerade as failures.
      expect(mockFailure.mock.calls.map(([facts]) => facts)).toEqual([
        { stage: 'negotiation', kind: 'unknown' },
        {
          stage: 'initialize',
          kind: 'refused-or-unreachable',
          fallback: {
            negotiation: { stage: 'negotiation', kind: 'unknown' },
            legacy: { stage: 'initialize', kind: 'refused-or-unreachable' },
          },
        },
      ]);
    } finally {
      mockFailure.mockReset();
    }
  });

  it.each(['synchronous', 'asynchronous'] as const)(
    'consumes a %s throwing stream observer without replacing the original failure',
    async (timing) => {
      const error = new TypeError('original socket');
      const unhandled = jest.fn();
      process.on('unhandledRejection', unhandled);
      mockFailure.mockImplementationOnce(() => {
        if (timing === 'asynchronous') return Promise.reject(new Error('observer'));
        throw new Error('observer');
      });
      mockConnect.mockImplementationOnce(async () => {
        mockExpoFetch.mockResolvedValueOnce(
          streamingResponse(
            new ReadableStream({
              start(controller) {
                controller.error(error);
              },
            }),
            'application/json',
          ),
        );
        await mockTransport.fetch(endpointUrl, {
          method: 'POST',
          body: JSON.stringify({ method: 'initialize', id: 1 }),
        });
      });
      try {
        await expect(open()).rejects.toBe(error);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(unhandled).not.toHaveBeenCalled();
        expect(mockFailure).toHaveBeenCalledTimes(1);
      } finally {
        process.removeListener('unhandledRejection', unhandled);
        mockFailure.mockReset();
      }
    },
  );

  it.each([SdkErrorCode.ClientHttpAuthentication, SdkErrorCode.ClientHttpForbidden])(
    'keeps statusless %s non-retryable after an observed transport failure',
    async (code) => {
      const error = new SdkError(code, 'auth');
      mockConnect.mockImplementationOnce(async () => {
        mockExpoFetch.mockResolvedValueOnce(
          streamingResponse(
            new ReadableStream({
              start(controller) {
                controller.error(new TypeError('socket'));
              },
            }),
            'application/json',
          ),
        );
        await mockTransport
          .fetch(endpointUrl, {
            method: 'POST',
            body: JSON.stringify({ method: 'initialize', id: 1 }),
          })
          .catch(() => undefined);
        throw error;
      });
      const result = await createRemoteMcpClient({
        config: { endpointUrl },
        signal: new AbortController().signal,
        foreground: false,
        authorization,
        shouldUseLegacyProtocol: true,
        onConnectionFailure: mockFailure,
      }).catch((failure: unknown) => failure);
      expect(result).toBe(error);
      expect(result).toBeInstanceOf(SdkError);
      expect(result).not.toBeInstanceOf(McpLegacyFallbackError);
      expect(mockAttempts).toHaveLength(1);
      expect(mockFailure.mock.calls.map(([facts]) => facts)).toEqual([
        { stage: 'initialize', kind: 'auth-required' },
      ]);
    },
  );

  it('marks fetch rejections while leaving local request errors unknown', async () => {
    await open();
    const context = { stage: 'initialize' as const, didTimeout: false, timeoutMs: 15000 };
    const failure = Object.freeze(new TypeError('private transport details'));
    mockExpoFetch.mockRejectedValueOnce(failure);
    await expect(mockTransport.fetch(endpointUrl, { method: 'POST' })).rejects.toBe(failure);
    expect(mockFailure).toHaveBeenLastCalledWith({
      stage: 'negotiation',
      kind: 'refused-or-unreachable',
    });
    expect(readMcpFailureFacts(failure)).toBeUndefined();
    mockExpoFetch.mockClear();
    let localError: unknown;
    try {
      await mockTransport.fetch(endpointUrl, {
        method: 'POST',
        headers: { 'invalid\nheader': 'secret' },
      });
    } catch (error) {
      localError = error;
    }
    expect(localError).toMatchObject({ name: 'TypeError' });
    expect(mockExpoFetch).not.toHaveBeenCalled();
    expect(normalizeMcpConnectionFailure(localError, context).kind).toBe('unknown');
  });

  it.each(['application/json', 'text/event-stream'])(
    'captures %s response stream transport failures without secrets',
    async (contentType) => {
      await open();
      const error = Object.freeze(
        new TypeError('Bearer stream-sentinel https://private/#fragment'),
      );
      mockExpoFetch.mockResolvedValueOnce(
        streamingResponse(
          new ReadableStream({
            start(controller) {
              controller.error(error);
            },
          }),
          contentType,
        ),
      );
      let rejection: unknown;
      try {
        const response = await mockTransport.fetch(endpointUrl, {
          method: 'POST',
          body: JSON.stringify({ method: 'initialize' }),
        });
        const reader = response.body!.getReader();
        try {
          await reader.read();
        } finally {
          reader.releaseLock();
        }
      } catch (failure) {
        rejection = failure;
      }
      expect(rejection).toBe(error);
      const facts = mockFailure.mock.calls.at(-1)![0];
      expect(readMcpFailureFacts(error)).toBeUndefined();
      expect(facts).toEqual({ stage: 'initialize', kind: 'refused-or-unreachable' });
      expect(JSON.stringify(facts) + formatMcpConnectionFailureSummary(facts)).not.toMatch(
        /Bearer|sentinel|https|fragment/,
      );
    },
  );

  it.each(['application/json', 'text/event-stream'])(
    'does not mark %s stream cancellation as transport',
    async (contentType) => {
      await open();
      const error = Object.assign(new Error('cancelled'), { name: 'AbortError' });
      mockExpoFetch.mockResolvedValueOnce(
        streamingResponse(
          new ReadableStream({
            start(controller) {
              controller.error(error);
            },
          }),
          contentType,
        ),
      );
      try {
        const response = await mockTransport.fetch(endpointUrl, { method: 'POST' });
        await response.body!.getReader().read();
      } catch (failure) {
        expect(failure).toBe(error);
      }
      expect(mockFailure.mock.calls.at(-1)![0].kind).toBe('unknown');
      expect(readMcpFailureFacts(error)).toBeUndefined();
    },
  );

  it('captures independent attempts when the SDK reuses its rejection object', async () => {
    const error = Object.assign(new SdkError(SdkErrorCode.EraNegotiationFailed, 'private'), {
      cause: { code: 'ETIMEDOUT' },
    });
    mockConnect.mockRejectedValueOnce(error).mockRejectedValueOnce(error);
    await expect(open()).rejects.toMatchObject({
      connectionFailure: {
        fallback: {
          negotiation: { stage: 'negotiation', kind: 'timeout' },
          legacy: { stage: 'initialize', kind: 'timeout' },
        },
      },
    });
  });

  it.each([
    new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, 'private', { status: 401 }),
    new SdkError(SdkErrorCode.RequestTimeout, 'private'),
  ])('retains negotiation facts on non-retryable legacy rejection %p', async (error) => {
    mockConnect
      .mockRejectedValueOnce(
        new SdkHttpError(SdkErrorCode.EraNegotiationFailed, 'private', { status: 500 }),
      )
      .mockRejectedValueOnce(error);
    await expect(open()).rejects.toBe(error);
    expect(mockFailure.mock.calls.at(-1)![0]).toMatchObject({
      fallback: {
        negotiation: { stage: 'negotiation', kind: 'http-status', httpStatus: 500 },
        legacy: {
          stage: 'initialize',
          kind: error instanceof SdkHttpError ? 'auth-required' : 'timeout',
        },
      },
    });
  });

  it('closes the failed attempt before opening a fresh legacy client', async () => {
    const callback = jest.fn();
    mockConnect.mockImplementationOnce(async () => {
      throw new SdkError(SdkErrorCode.EraNegotiationFailed, 'failed');
    });
    mockConnect.mockImplementationOnce(async () => {
      expect(mockAttempts[0]!.close).toHaveBeenCalledTimes(1);
    });
    const client = await createRemoteMcpClient({
      config: { endpointUrl },
      signal: new AbortController().signal,
      foreground: false,
      authorization,
      onLegacyPreferenceChanged: callback,
    });
    expect(mockAttempts.map(({ options }) => options.versionNegotiation)).toEqual([
      { mode: 'auto', probe: { maxRetries: 0, timeoutMs: 15_000 } },
      { mode: 'legacy' },
    ]);
    expect(mockAttempts[1]!.close).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(true);
    await client.close();
    expect(mockAttempts[0]!.close).toHaveBeenCalledTimes(1);
    expect(mockAttempts[1]!.close).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'does not retry an aborted negotiation with legacy preference %s',
    async (shouldUseLegacyProtocol) => {
      const controller = new AbortController();
      const callback = jest.fn();
      mockConnect.mockImplementationOnce(async () => {
        controller.abort();
        throw new SdkError(SdkErrorCode.EraNegotiationFailed, 'failed');
      });
      await expect(
        createRemoteMcpClient({
          config: { endpointUrl },
          signal: controller.signal,
          foreground: false,
          authorization,
          shouldUseLegacyProtocol,
          onLegacyPreferenceChanged: callback,
        }),
      ).rejects.toBeDefined();
      expect(mockAttempts).toHaveLength(1);
      expect(callback).not.toHaveBeenCalled();
    },
  );

  it('keeps a working legacy preference without probing', async () => {
    const callback = jest.fn();
    const client = await createRemoteMcpClient({
      config: { endpointUrl },
      signal: new AbortController().signal,
      foreground: false,
      authorization,
      shouldUseLegacyProtocol: true,
      onLegacyPreferenceChanged: callback,
    });
    expect(mockAttempts).toHaveLength(1);
    expect(mockAttempts[0]!.options.versionNegotiation).toEqual({ mode: 'legacy' });
    expect(callback).not.toHaveBeenCalled();
    await client.close();
  });

  it('forgets a failed legacy preference before a fresh automatic negotiation', async () => {
    mockConnect.mockRejectedValueOnce(new Error('legacy is no longer supported'));
    const callback = jest.fn();
    mockConnect.mockImplementationOnce(async () => {
      expect(mockAttempts[0]!.close).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(false);
    });
    const client = await createRemoteMcpClient({
      config: { endpointUrl },
      signal: new AbortController().signal,
      foreground: false,
      authorization,
      shouldUseLegacyProtocol: true,
      onLegacyPreferenceChanged: callback,
    });
    expect(mockAttempts.map(({ options }) => options.versionNegotiation)).toEqual([
      { mode: 'legacy' },
      { mode: 'auto', probe: { maxRetries: 0, timeoutMs: 15_000 } },
    ]);
    expect(callback).toHaveBeenCalledTimes(1);
    await client.close();
    expect(mockAttempts[0]!.close).toHaveBeenCalledTimes(1);
    expect(mockAttempts[1]!.close).toHaveBeenCalledTimes(1);
  });

  it('retains both failures without repeating a failed preferred handshake', async () => {
    const legacyError = new Error('legacy is no longer supported');
    const negotiationError = new SdkError(SdkErrorCode.EraNegotiationFailed, 'probe failed');
    mockConnect.mockRejectedValueOnce(legacyError).mockRejectedValueOnce(negotiationError);
    const callback = jest.fn();
    const error = await createRemoteMcpClient({
      config: { endpointUrl },
      signal: new AbortController().signal,
      foreground: false,
      authorization,
      shouldUseLegacyProtocol: true,
      onLegacyPreferenceChanged: callback,
    }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(McpLegacyFallbackError);
    expect(error).toMatchObject({ negotiationError, cause: legacyError });
    expect(mockAttempts).toHaveLength(2);
    expect(callback.mock.calls).toEqual([[false]]);
    expect(mockAttempts[0]!.close).toHaveBeenCalledTimes(1);
    expect(mockAttempts[1]!.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    new McpAuthorizationError('reauthorize'),
    new McpRedirectError('https://elsewhere.example/mcp'),
    Object.assign(new Error('cancelled'), { name: 'AbortError' }),
    new SdkError(SdkErrorCode.RequestTimeout, 'timeout'),
    new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, 'unauthorized', { status: 401 }),
    new SdkHttpError(SdkErrorCode.ClientHttpForbidden, 'forbidden', { status: 403 }),
  ])('does not probe after a preferred legacy connection fails with %s', async (failure) => {
    mockConnect.mockRejectedValueOnce(failure);
    const callback = jest.fn();
    await expect(
      createRemoteMcpClient({
        config: { endpointUrl },
        signal: new AbortController().signal,
        foreground: false,
        authorization,
        shouldUseLegacyProtocol: true,
        onLegacyPreferenceChanged: callback,
      }),
    ).rejects.toBe(failure);
    expect(mockAttempts).toHaveLength(1);
    expect(mockAttempts[0]!.options.versionNegotiation).toEqual({ mode: 'legacy' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not retry an SDK timeout', async () => {
    mockConnect.mockRejectedValueOnce(new SdkError(SdkErrorCode.RequestTimeout, 'timeout'));
    await expect(open()).rejects.toMatchObject({ code: SdkErrorCode.RequestTimeout });
    expect(mockAttempts).toHaveLength(1);
  });

  it('routes tool and prompt list changes to one catalog refresh only while active', async () => {
    const onCatalogChanged = jest.fn();
    const client = await createRemoteMcpClient({
      config: { endpointUrl },
      signal: new AbortController().signal,
      foreground: true,
      authorization,
      onCatalogChanged,
    });
    const handlers = mockOptions.listChanged as Record<'tools' | 'prompts', { onChanged(): void }>;
    handlers.prompts.onChanged();
    handlers.tools.onChanged();
    expect(onCatalogChanged).toHaveBeenCalledTimes(2);
    client.setForeground?.(false);
    handlers.prompts.onChanged();
    await client.close();
    handlers.prompts.onChanged();
    expect(onCatalogChanged).toHaveBeenCalledTimes(2);
  });

  it('reads bounded JSON with the React Native Response implementation', async () => {
    const client = await open();
    const encoded = new TextEncoder().encode(JSON.stringify({ name: 'Cherry 验收' }));
    mockExpoFetch.mockResolvedValue(
      streamingResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoded.slice(0, encoded.length - 3));
            controller.enqueue(encoded.slice(encoded.length - 3));
            controller.close();
          },
        }),
        'application/json',
      ),
    );
    const originalResponse = globalThis.Response;
    globalThis.Response = jest.requireActual('whatwg-fetch').Response;
    try {
      const response = await mockTransport.fetch(endpointUrl, { method: 'POST', body: '{}' });
      await expect(response.json()).resolves.toEqual({ name: 'Cherry 验收' });
    } finally {
      globalThis.Response = originalResponse;
      await client.close();
    }
  });

  it('keeps native SSE streaming with the React Native Response implementation', async () => {
    const client = await open();
    const event = 'data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n';
    mockExpoFetch.mockResolvedValue(
      streamingResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(event));
            controller.close();
          },
        }),
        'text/event-stream',
      ),
    );
    const originalResponse = globalThis.Response;
    globalThis.Response = jest.requireActual('whatwg-fetch').Response;
    try {
      const response = await mockTransport.fetch(endpointUrl, { method: 'POST', body: '{}' });
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(event);
      await reader.cancel();
      reader.releaseLock();
    } finally {
      globalThis.Response = originalResponse;
      await client.close();
    }
  });

  it.each(['application/json', 'text/event-stream'])(
    'rejects oversized %s responses and cancels the native stream',
    async (contentType) => {
      const client = await open();
      let canceled!: () => void;
      const cancellation = new Promise<void>((resolve) => {
        canceled = resolve;
      });
      const cancel = jest.fn(() => canceled());
      mockExpoFetch.mockResolvedValue(
        streamingResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
            },
            cancel,
          }),
          contentType,
        ),
      );
      await expect(
        (async () => {
          const response = await mockTransport.fetch(endpointUrl, { method: 'POST', body: '{}' });
          await response.body!.getReader().read();
        })(),
      ).rejects.toThrow('The MCP response exceeds the size limit.');
      await cancellation;
      expect(cancel).toHaveBeenCalledTimes(1);
      await client.close();
    },
  );

  it.each(['token', '401', '403', 'redirect', 'size-limit'] as const)(
    'releases request observers after repeated %s failures on a live client',
    async (failure) => {
      const client = await open();
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
        for (let id = 1; id <= 4; id += 1) {
          authorization.token.mockImplementation(async () => {
            if (failure === 'token') throw new Error('token lookup');
            return 'expired';
          });
          mockExpoFetch.mockImplementation(async () => {
            if (failure === 'size-limit')
              return streamingResponse(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
                  },
                }),
                'application/json',
              );
            return new Response(null, {
              status: failure === 'redirect' ? 302 : Number(failure),
              headers:
                failure === 'redirect'
                  ? { location: 'https://other.example/mcp' }
                  : failure === '403'
                    ? { 'www-authenticate': 'Bearer error="insufficient_scope"' }
                    : {},
            });
          });
          await expect(
            mockTransport.fetch(endpointUrl, {
              method: 'POST',
              body: JSON.stringify({ method: 'tools/list', id }),
            }),
          ).rejects.toBeDefined();
          expect(listeners.size).toBe(0);
        }
        expect(mockClose).not.toHaveBeenCalled();
      } finally {
        add.mockRestore();
        remove.mockRestore();
        await client.close();
      }
    },
  );

  it('requests automatic protocol negotiation and pins the approved tool definition without an auth replay provider', async () => {
    const client = await open();
    await client.listTools();
    await client.callTool({
      name: 'write',
      args: {},
      options: { abortSignal: new AbortController().signal },
    });
    expect(mockOptions.versionNegotiation).toMatchObject({
      mode: 'auto',
      probe: { maxRetries: 0 },
    });
    expect(mockTransport.authProvider).toBeUndefined();
    expect(mockTransport.onInsufficientScope).toBe('throw');
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0]![1]).toMatchObject({ toolDefinition: mockTool });
    // A server hint cannot make the phone revalidate more often than the floor.
    expect(client.catalogExpiresAt).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    await client.close();
  });

  it('leaves same-origin redirects to the transport and refuses to follow one to another origin', async () => {
    const client = await open();
    expect(mockTransport.requestInit).toEqual({ headers: {} });
    mockExpoFetch.mockResolvedValue(
      new Response(null, { status: 307, headers: { location: '/mcp/' } }),
    );
    const canonical = await mockTransport.fetch(endpointUrl, {
      method: 'POST',
      body: '{}',
      redirect: 'manual',
    });
    expect(canonical.headers.get('location')).toBe('/mcp/');
    await expect(
      mockTransport.fetch('https://mcp.example/mcp/', { method: 'POST', body: '{}' }),
    ).resolves.toBeDefined();

    mockExpoFetch.mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: 'https://user:pass@elsewhere.example/mcp?token=secret#frag' },
      }),
    );
    const moved = await mockTransport
      .fetch(endpointUrl, { method: 'POST', body: '{}' })
      .catch((error: unknown) => error);
    expect(moved).toBeInstanceOf(McpRedirectError);
    expect((moved as McpRedirectError).location).toBe('https://elsewhere.example/mcp');
    await expect(
      mockTransport.fetch('https://elsewhere.example/mcp', { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ code: 'configuration' });
    expect(mockExpoFetch).toHaveBeenCalledTimes(3);
    await client.close();
  });

  it('surfaces the boundary failure that version negotiation wrapped while connecting', async () => {
    const moved = new McpRedirectError('https://elsewhere.example/mcp');
    mockConnect.mockRejectedValueOnce(
      new Error('Version negotiation probe failed', { cause: moved }),
    );
    await expect(open()).rejects.toBe(moved);
  });

  it('recognizes failures that prove the server refused the call', () => {
    expect(classifyMcpCallRejection(new McpAuthorizationError('reauthorize'))).toMatchObject({
      failure: { code: 'mcp_tool_unavailable', retryable: false },
      staleCatalog: false,
    });
    expect(
      classifyMcpCallRejection(new McpRedirectError('https://elsewhere.example/mcp')),
    ).toMatchObject({
      failure: {
        code: 'mcp_tool_unavailable',
        message: expect.stringContaining('https://elsewhere.example/mcp'),
      },
    });
    expect(classifyMcpCallRejection(new ProtocolError(-32602, 'Unknown tool'))).toMatchObject({
      failure: { code: 'mcp_tool_call_failed', retryable: false },
      staleCatalog: true,
    });
    const http = (status: number) =>
      new SdkHttpError(SdkErrorCode.ClientHttpNotImplemented, 'failed', { status });
    expect(classifyMcpCallRejection(http(404))).toMatchObject({
      failure: { code: 'mcp_tool_call_failed', retryable: true },
      staleCatalog: false,
    });
    // A server error or a dropped socket can follow a call that already ran.
    expect(classifyMcpCallRejection(http(502))).toBeUndefined();
    expect(classifyMcpCallRejection(new ProtocolError(-32603, 'Internal error'))).toBeUndefined();
    expect(classifyMcpCallRejection(new Error('socket closed'))).toBeUndefined();
  });

  it('rejects a token once without repeating the HTTP write', async () => {
    const client = await open();
    authorization.token.mockResolvedValue('private-token');
    mockExpoFetch.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      mockTransport.fetch(endpointUrl, { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ code: 'reauthorize' });
    expect(mockExpoFetch).toHaveBeenCalledTimes(1);
    expect(authorization.rejected).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it('only opens elicitation while an initiating operation is active', async () => {
    const elicit = jest.fn(async () => ({
      action: 'accept' as const,
      content: { name: 'Cherry' },
    }));
    const client = await open(elicit);
    const request = { params: { mode: 'form' } };
    const context = { mcpReq: { signal: new AbortController().signal } };
    await expect(mockHandler(request, context)).resolves.toEqual({ action: 'cancel' });
    expect(elicit).not.toHaveBeenCalled();
    await client.listTools();
    mockCall.mockImplementation(async () => {
      await expect(mockHandler(request, context)).resolves.toMatchObject({ action: 'accept' });
      return { content: [] };
    });
    await client.callTool({
      name: 'write',
      args: {},
      options: { abortSignal: new AbortController().signal },
    });
    await expect(mockHandler(request, context)).resolves.toEqual({ action: 'cancel' });
    expect(elicit).toHaveBeenCalledTimes(1);
    await client.close();
  });
});

it('keeps a shared rejection untouched while two connections capture different stages', async () => {
  const error = Object.freeze(
    new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, 'private', { status: 401 }),
  );
  mockConnect.mockRejectedValueOnce(error).mockRejectedValueOnce(error);
  const initialization = jest.fn();
  const negotiation = jest.fn();
  const input = {
    config: { endpointUrl },
    signal: new AbortController().signal,
    foreground: false,
    authorization,
  };
  await expect(
    createRemoteMcpClient({
      ...input,
      shouldUseLegacyProtocol: true,
      onConnectionFailure: initialization,
    }),
  ).rejects.toBe(error);
  const firstFacts = initialization.mock.calls.at(-1)![0];
  await expect(createRemoteMcpClient({ ...input, onConnectionFailure: negotiation })).rejects.toBe(
    error,
  );
  expect(firstFacts).toEqual({ stage: 'initialize', kind: 'auth-required', httpStatus: 401 });
  expect(negotiation.mock.calls.at(-1)![0]).toEqual({
    stage: 'negotiation',
    kind: 'auth-required',
    httpStatus: 401,
  });
  expect(initialization.mock.calls.at(-1)![0]).toBe(firstFacts);
  expect(readMcpFailureFacts(error)).toBeUndefined();
});
