import type { ToolSet } from 'ai';

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
  close: jest.Mock;
  listTools: jest.Mock;
  serverInfo: { name: string; title?: string; version: string };
  tools: jest.Mock;
  toolsFromDefinitions: jest.Mock;
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

function makeRawTools(names: string[]): ToolSet {
  return Object.fromEntries(
    names.map((name) => [name, { description: `desc ${name}`, inputSchema: {}, type: 'dynamic' }]),
  ) as unknown as ToolSet;
}

function makeToolDefinitions(tools: ToolSet) {
  return Object.entries(tools).map(([name, rawTool]) => ({
    description: typeof rawTool.description === 'string' ? rawTool.description : undefined,
    inputSchema: { properties: {}, type: 'object' as const },
    name,
    rawTool,
  }));
}

function makeClient(tools: ToolSet): FakeClient {
  const client: FakeClient = {
    close: jest.fn(async () => undefined),
    listTools: jest.fn(),
    serverInfo: { name: 'test-server', title: 'Test MCP', version: '1.2.3' },
    tools: jest.fn(async () => tools),
    toolsFromDefinitions: jest.fn(),
  };
  client.listTools.mockImplementation((args?: { options?: { signal?: AbortSignal } }) =>
    abortable(
      (async () => ({ tools: makeToolDefinitions(await client.tools()) }))(),
      args?.options?.signal,
      'Request was aborted',
    ),
  );
  client.toolsFromDefinitions.mockImplementation(
    ({ tools: definitions }: { tools: ReturnType<typeof makeToolDefinitions> }) =>
      Object.fromEntries(definitions.map((definition) => [definition.name, definition.rawTool])),
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
    expect(client.tools).not.toHaveBeenCalled();
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
    stale.tools.mockRejectedValue(new Error('session expired'));
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
        tools: makeToolDefinitions(makeRawTools(['search'])),
      })
      .mockResolvedValueOnce({ tools: makeToolDefinitions(makeRawTools(['open'])) });
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
    const tools = deferred<ToolSet>();
    const client = makeClient(makeRawTools(['search']));
    client.tools.mockReturnValue(tools.promise);
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    const first = service.listTools(server.id);
    await flush();
    const second = service.listTools(server.id);
    tools.resolve(makeRawTools(['search']));

    await expect(first).resolves.toEqual([{ description: 'desc search', name: 'search' }]);
    await expect(second).resolves.toEqual([{ description: 'desc search', name: 'search' }]);
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
  });
});

describe('runtime lifecycle', () => {
  it('reports connection errors without rejecting summaries', async () => {
    const client = makeClient(makeRawTools([]));
    client.tools.mockRejectedValue(new Error('401 unauthorized'));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    await expect(service.listTools(server.id)).rejects.toThrow('401 unauthorized');
    await expect(service.getRuntimeSummaries([server])).resolves.toEqual({
      [server.id]: { lastError: '401 unauthorized', state: 'error' },
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
    stalled.tools.mockReturnValue(new Promise(() => undefined));
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
