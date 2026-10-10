import { fetch as expoFetch } from 'expo/fetch';

import { createRemoteMcpClient } from '../mcpProtocolClient';

const mockTool = { name: 'write', inputSchema: { type: 'object' } };
const mockCall = jest.fn();
const mockClose = jest.fn(async () => {});
let mockOptions: Record<string, unknown>;
let mockTransport: { fetch: typeof fetch; authProvider?: unknown; onInsufficientScope?: unknown };
let mockHandler: (
  request: { params: unknown },
  context: { mcpReq: { signal: AbortSignal } },
) => Promise<unknown>;
let mockListResult: object;

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@modelcontextprotocol/client', () => ({
  Client: class {
    constructor(_info: unknown, options: Record<string, unknown>) {
      mockOptions = options;
    }
    connect = async () => {};
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

beforeEach(() => {
  jest.clearAllMocks();
  mockListResult = { tools: [mockTool], ttlMs: 1000 };
  mockCall.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });
  authorization.token.mockResolvedValue(undefined);
});

describe('native MCP protocol boundary', () => {
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
    expect(client.catalogExpiresAt).toBeGreaterThan(Date.now());
    await client.close();
  });

  it('rejects a token once without repeating the HTTP write', async () => {
    const client = await open();
    authorization.token.mockResolvedValue('private-token');
    jest.mocked(expoFetch).mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      mockTransport.fetch(endpointUrl, { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ code: 'reauthorize' });
    expect(expoFetch).toHaveBeenCalledTimes(1);
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
