import { ProtocolError, SdkErrorCode, SdkHttpError } from '@modelcontextprotocol/client';

import { McpAuthorizationError, McpRedirectError } from '@/shared/contracts/mcp';

import { classifyMcpCallRejection, createRemoteMcpClient } from '../mcpProtocolClient';

const mockTool = { name: 'write', inputSchema: { type: 'object' } };
const mockCall = jest.fn();
const mockClose = jest.fn(async () => {});
const mockConnect = jest.fn(async () => {});
const mockExpoFetch = jest.fn();
let mockOptions: Record<string, unknown>;
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
    }
    connect = mockConnect;
    close = mockClose;
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
const authorization = { token: jest.fn(), rejected: jest.fn() };
function open(elicit?: Parameters<typeof createRemoteMcpClient>[0]['elicit']) {
  return createRemoteMcpClient({
    config: { endpointUrl },
    signal: new AbortController().signal,
    foreground: true,
    authorization,
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
  mockListResult = { tools: [mockTool], ttlMs: 1000 };
  mockCall.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });
  authorization.token.mockResolvedValue(undefined);
});

describe('native MCP protocol boundary', () => {
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
