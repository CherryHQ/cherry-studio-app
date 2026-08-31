import type { ListToolsResult } from '@ai-sdk/mcp';

import { mcpServerService } from '@/backend/data/services/McpServerService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { McpRuntimeService } from '../McpRuntimeService';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockCreateMCPClient = jest.fn();
jest.mock('@ai-sdk/mcp', () => ({
  createMCPClient: (...args: unknown[]) => mockSdkInitContract(...args),
}));

function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  message: string,
  onAbort?: () => void,
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      reject(new Error(message));
      onAbort?.();
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function mockSdkInitContract(...args: unknown[]): Promise<unknown> {
  const config = args[0] as { initializationOptions?: { signal?: AbortSignal } } | undefined;
  const connect = Promise.resolve(mockCreateMCPClient(...args));
  return abortable(
    connect,
    config?.initializationOptions?.signal,
    'MCP client initialization was aborted',
    () => {
      void connect
        .then((client) => (client as { close?: () => Promise<void> } | undefined)?.close?.())
        .catch(() => undefined);
    },
  );
}

type FakeClient = {
  callTool: jest.Mock;
  close: jest.Mock;
  listTools: jest.Mock;
  serverInfo: { name: string; title?: string; version: string };
};

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    disabledTools: [],
    endpointUrl: 'https://a.example/mcp',
    id: 'server-1',
    isEnabled: true,
    name: 'ServerOne',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRawTools(names: string[]): ListToolsResult['tools'] {
  return names.map((name) => ({
    description: `desc ${name}`,
    inputSchema: { properties: {}, type: 'object' as const },
    name,
  }));
}

function makeClient(tools: ListToolsResult['tools']): FakeClient {
  const client: FakeClient = {
    callTool: jest.fn(async ({ args, name }: { args: unknown; name: string }) => ({
      args,
      content: [],
      name,
    })),
    close: jest.fn(async () => undefined),
    listTools: jest.fn(async () => ({ tools })),
    serverInfo: { name: 'test-server', title: 'Test MCP', version: '1.2.3' },
  };
  client.listTools.mockImplementation((args?: { options?: { signal?: AbortSignal } }) =>
    abortable(Promise.resolve({ tools }), args?.options?.signal, 'Request was aborted'),
  );
  return client;
}

function makeService(servers: McpServer[]) {
  const getById = jest.spyOn(mcpServerService, 'getById').mockImplementation(async (id) => {
    const found = servers.find((server) => server.id === id);
    if (!found) throw DataApiErrorFactory.notFound('McpServer', id);
    return { ...found };
  });
  jest
    .spyOn(mcpServerService, 'list')
    .mockImplementation(async () => ({ items: servers, total: servers.length }) as never);
  return { getById, service: new McpRuntimeService() };
}

beforeEach(() => {
  mockCreateMCPClient.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getServerInfo', () => {
  it('returns initialization metadata and closes the temporary client', async () => {
    const client = makeClient(makeRawTools(['a']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([]);

    await expect(service.getServerInfo({ endpointUrl: 'https://x.example/mcp' })).resolves.toEqual({
      name: 'test-server',
      title: 'Test MCP',
      version: '1.2.3',
    });
    expect(client.close).toHaveBeenCalled();
    expect(client.listTools).not.toHaveBeenCalled();
  });

  it('passes custom request headers to the HTTP transport', async () => {
    const client = makeClient(makeRawTools(['a']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([]);

    await service.getServerInfo({
      endpointUrl: 'https://x.example/mcp',
      headers: { Authorization: 'Bearer secret', 'X-API-Key': 'key' },
    });

    expect(mockCreateMCPClient).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          headers: { Authorization: 'Bearer secret', 'X-API-Key': 'key' },
        }),
      }),
    );
  });

  it('bounds initialization and closes a client that connects late', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const connection = deferred<FakeClient>();
      const client = makeClient(makeRawTools(['a']));
      mockCreateMCPClient.mockReturnValue(connection.promise);
      const { service } = makeService([]);

      const request = service.getServerInfo({ endpointUrl: 'https://x.example/mcp' });
      const assertion = expect(request).rejects.toThrow('MCP server info timed out after 15000ms');
      jest.advanceTimersByTime(15_000);
      await assertion;

      connection.resolve(client);
      await flush();
      expect(client.close).toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

describe('listTools', () => {
  it('rejects a non-http endpoint before opening a connection', async () => {
    const server = makeServer({ endpointUrl: 'ftp://a.example/mcp' });
    const { service } = makeService([server]);

    await expect(service.listTools(server.id)).rejects.toThrow('has no valid HTTP URL');
    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('reads the stored row and projects tool summaries', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { getById, service } = makeService([makeServer()]);

    await expect(service.listTools('server-1')).resolves.toEqual([
      { description: 'desc search', name: 'search' },
    ]);
    expect(getById).toHaveBeenCalledWith('server-1');
  });

  it('reconnects once when a pooled client has gone stale', async () => {
    const stale = makeClient(makeRawTools(['search']));
    stale.listTools.mockRejectedValue(new Error('session expired'));
    const fresh = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    const server = makeServer();
    const { service } = makeService([server]);

    await expect(service.listTools(server.id)).resolves.toEqual([
      { description: 'desc search', name: 'search' },
    ]);
    expect(stale.close).toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
  });

  it('loads every tools/list page and records the complete count', async () => {
    const client = makeClient(makeRawTools([]));
    client.listTools
      .mockResolvedValueOnce({
        nextCursor: 'page-2',
        tools: makeRawTools(['search']),
      })
      .mockResolvedValueOnce({ tools: makeRawTools(['open']) });
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    await expect(service.listTools(server.id)).resolves.toEqual([
      { description: 'desc search', name: 'search' },
      { description: 'desc open', name: 'open' },
    ]);
    await expect(service.getRuntimeSummaries([server])).resolves.toMatchObject({
      [server.id]: { state: 'connected', toolCount: 2 },
    });
    expect(client.listTools).toHaveBeenCalledTimes(2);
  });

  it('reuses one pooled connection across concurrent listings', async () => {
    const tools = deferred<ListToolsResult>();
    const client = makeClient(makeRawTools(['search']));
    client.listTools.mockReturnValue(tools.promise);
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    const first = service.listTools(server.id);
    await flush();
    const second = service.listTools(server.id);
    tools.resolve({ tools: makeRawTools(['search']) });

    await expect(first).resolves.toEqual([{ description: 'desc search', name: 'search' }]);
    await expect(second).resolves.toEqual([{ description: 'desc search', name: 'search' }]);
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
  });

  it('replaces a pooled connection when request headers change', async () => {
    const first = makeClient(makeRawTools(['search']));
    const second = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValueOnce(first).mockResolvedValue(second);
    const server = makeServer({ headers: { Authorization: 'Bearer first' } });
    const { service } = makeService([server]);

    await service.listTools(server.id);
    server.headers = { Authorization: 'Bearer second' };
    await service.listTools(server.id);

    expect(first.close).toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
  });
});

describe('Runtime tool adapter', () => {
  it('preserves paginated raw identities and JSON Schemas while filtering disabled tools', async () => {
    const client = makeClient(makeRawTools([]));
    client.listTools
      .mockResolvedValueOnce({
        nextCursor: 'page-2',
        tools: [
          {
            description: 'Search issues',
            inputSchema: {
              properties: { query: { minLength: 1, type: 'string' } },
              required: ['query'],
              type: 'object',
            },
            name: 'search',
            title: 'Issue Search',
          },
        ],
      })
      .mockResolvedValueOnce({
        tools: [
          {
            inputSchema: { properties: {}, type: 'object' },
            name: 'disabled-tool',
          },
        ],
      });
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer({ disabledTools: ['disabled-tool'] });
    const { service } = makeService([server]);

    const descriptors = await service.listExecutableToolDescriptors(server.id);
    expect(descriptors).toEqual([
      {
        description: 'Search issues',
        displayName: 'Issue Search',
        endpointUrl: server.endpointUrl,
        generation: expect.any(Number),
        inputSchema: {
          properties: { query: { minLength: 1, type: 'string' } },
          required: ['query'],
          type: 'object',
        },
        rawToolName: 'search',
        serverId: server.id,
      },
    ]);
    expect(Object.getOwnPropertySymbols(descriptors[0]!.inputSchema as object)).toEqual([]);
    expect(client.listTools).toHaveBeenCalledTimes(2);
  });

  it('fails closed when pagination repeats a raw tool identity', async () => {
    const client = makeClient(makeRawTools([]));
    client.listTools.mockResolvedValue({
      tools: [
        { inputSchema: { properties: {}, type: 'object' }, name: 'search' },
        { inputSchema: { properties: {}, type: 'object' }, name: 'search' },
      ],
    });
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    await expect(service.listExecutableToolDescriptors(server.id)).rejects.toMatchObject({
      code: 'mcp_tool_unavailable',
      message: 'The MCP tool catalog contains a duplicate tool identity.',
    });
  });

  it('rechecks stored policy and invokes the exact raw tool with the supplied signal', async () => {
    const client = makeClient(makeRawTools(['search']));
    client.callTool.mockResolvedValue({
      content: [{ text: 'result', type: 'text' }],
      structuredContent: { count: 1 },
    });
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);
    const [descriptor] = await service.listExecutableToolDescriptors(server.id);
    const [tool] = service.createRuntimeTools([{ approval: 'ask', descriptor: descriptor! }]);
    const controller = new AbortController();

    await expect(
      tool!.execute({
        input: { query: 'cherry' },
        signal: controller.signal,
        toolCallId: 'call-1',
      }),
    ).resolves.toEqual({
      artifacts: [],
      value: {
        content: [{ text: 'result', type: 'text' }],
        structuredContent: { count: 1 },
      },
    });
    expect(client.callTool).toHaveBeenCalledWith({
      args: { query: 'cherry' },
      name: 'search',
      options: { abortSignal: expect.any(AbortSignal) },
    });
  });

  it.each([
    { disabledTools: ['search'] },
    { isEnabled: false },
    { endpointUrl: 'https://b.example/mcp' },
    { endpointUrl: 'ftp://private.example/mcp' },
  ])('refuses execution after the server policy changes', async (serverPatch) => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);
    const [descriptor] = await service.listExecutableToolDescriptors(server.id);
    const [tool] = service.createRuntimeTools([{ approval: 'ask', descriptor: descriptor! }]);
    Object.assign(server, serverPatch);

    await expect(
      tool!.execute({
        input: { query: 'cherry' },
        signal: new AbortController().signal,
        toolCallId: 'call-1',
      }),
    ).rejects.toMatchObject({ code: 'mcp_tool_unavailable' });
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it('does not revive a frozen tool after the same endpoint is rediscovered', async () => {
    const firstClient = makeClient(makeRawTools(['search']));
    const secondClient = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValueOnce(firstClient).mockResolvedValue(secondClient);
    const server = makeServer();
    const { service } = makeService([server]);
    const [descriptor] = await service.listExecutableToolDescriptors(server.id);
    const [frozenTool] = service.createRuntimeTools([{ approval: 'ask', descriptor: descriptor! }]);

    service.invalidateServer(server.id);
    await service.listExecutableToolDescriptors(server.id);

    await expect(
      frozenTool!.execute({
        input: { query: 'cherry' },
        signal: new AbortController().signal,
        toolCallId: 'call-1',
      }),
    ).rejects.toMatchObject({ code: 'mcp_tool_unavailable' });
    expect(secondClient.callTool).not.toHaveBeenCalled();
  });
});

describe('runtime lifecycle', () => {
  it('reports connection errors without rejecting summaries', async () => {
    const client = makeClient(makeRawTools([]));
    client.listTools.mockRejectedValue(new Error('401 unauthorized'));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    await expect(service.listTools(server.id)).rejects.toThrow('401 unauthorized');
    await expect(service.getRuntimeSummaries([server])).resolves.toEqual({
      [server.id]: { lastError: 'MCP connection failed.', state: 'error' },
    });
  });

  it('keeps the last successful metadata when a server is disabled', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);
    await service.listTools(server.id);

    service.invalidateServer(server.id, { preserveSnapshot: true });

    await expect(
      service.getRuntimeSummaries([{ ...server, isEnabled: false }]),
    ).resolves.toMatchObject({
      [server.id]: { state: 'disabled', toolCount: 1 },
    });
  });

  it('invalidates an in-flight listing and permits a replacement', async () => {
    const stalled = makeClient(makeRawTools(['old']));
    stalled.listTools.mockImplementation((args?: { options?: { signal?: AbortSignal } }) =>
      abortable(new Promise(() => undefined), args?.options?.signal, 'Request was aborted'),
    );
    const replacement = makeClient(makeRawTools(['new']));
    mockCreateMCPClient.mockResolvedValueOnce(stalled).mockResolvedValue(replacement);
    const server = makeServer();
    const { service } = makeService([server]);

    const first = service.listTools(server.id);
    const firstAssertion = expect(first).rejects.toThrow('was invalidated');
    await flush();
    service.invalidateServer(server.id);
    await firstAssertion;

    await expect(service.listTools(server.id)).resolves.toEqual([
      { description: 'desc new', name: 'new' },
    ]);
    expect(stalled.close).toHaveBeenCalled();
  });

  it('closes pooled clients and clears retained snapshots on stop', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);
    await service.listTools(server.id);
    service.invalidateServer(server.id, { preserveSnapshot: true });

    await service._doStop();

    expect(client.close).toHaveBeenCalled();
    expect(retainedSnapshotCount(service)).toBe(0);
  });
});

function retainedSnapshotCount(service: McpRuntimeService): number {
  const internals = service as unknown as { runtimeSnapshots: Map<string, unknown> };
  return internals.runtimeSnapshots.size;
}
