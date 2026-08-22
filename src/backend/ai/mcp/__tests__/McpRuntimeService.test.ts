import type { ToolSet } from 'ai';

import { mcpServerService } from '@/backend/data/services/McpServerService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { Assistant } from '@/shared/data/types/assistant';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { McpRuntimeService } from '../McpRuntimeService';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockCreateMCPClient = jest.fn();
jest.mock('@ai-sdk/mcp', () => ({
  createMCPClient: (...args: unknown[]) => mockSdkInitContract(...args),
}));

/**
 * Settle `promise` normally, but reject as soon as `signal` aborts — the
 * request-level contract the real SDK implements (verified against 1.0.71).
 * Built without `Promise.race` so the losing branch never becomes an
 * unhandled rejection.
 */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  message: string,
  onAbort?: () => void,
): Promise<T> {
  if (!signal) {
    return promise;
  }
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

/**
 * The real factory owns cleanup before it resolves: an initialize aborted via
 * `initializationOptions.signal` rejects, and a transport that finishes
 * connecting after that is closed by the SDK itself, never handed out.
 */
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
  instructions?: string;
  listTools: jest.Mock;
  serverInfo: { name: string; title?: string; version: string };
  tools: jest.Mock;
  toolsFromDefinitions: jest.Mock;
};

/** Let queued microtasks and the fire-and-forget refresh chain settle. */
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

function makeAssistant(): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '🌟',
    id: 'assistant-1',
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'A',
    orderKey: 'a0',
    prompt: '',
    settings: { ...DEFAULT_ASSISTANT_SETTINGS, mcpMode: 'auto' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** The abort contract a real MCP tool's execute honors via its transport. */
function abortableExecute(run: () => Promise<unknown>) {
  return jest.fn((_input: unknown, options?: { abortSignal?: AbortSignal }) =>
    abortable(run(), options?.abortSignal, 'Request was aborted'),
  );
}

function makeRawTools(names: string[]): ToolSet {
  return Object.fromEntries(
    names.map((name) => [
      name,
      {
        description: `desc ${name}`,
        execute: abortableExecute(async () => {
          // A macrotask, not just a microtask, so a call that outlives a tick
          // still has to beat the timeout bound rather than winning it for free.
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { content: [{ text: `ok ${name}`, type: 'text' }] };
        }),
        inputSchema: {},
        type: 'dynamic',
      },
    ]),
  ) as unknown as ToolSet;
}

/** A tool whose execute resolves with whatever the caller supplies. */
function makeRawTool(name: string, execute: () => Promise<unknown>): ToolSet {
  return {
    [name]: {
      description: name,
      execute: abortableExecute(execute),
      inputSchema: {},
      type: 'dynamic',
    },
  } as unknown as ToolSet;
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
    instructions: 'Use this server to search documentation.',
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
  // The rows come from the `mcpServerService` module singleton now, so they are
  // spied rather than injected. Hand out a copy: sharing the row object with the
  // caller would let a test mutate what production code already captured, and
  // pass without the code ever re-reading anything.
  const getById = jest.spyOn(mcpServerService, 'getById').mockImplementation(async (id) => {
    const found = servers.find((server) => server.id === id);
    if (!found) throw DataApiErrorFactory.notFound('McpServer', id);
    return { ...found };
  });
  const list = jest
    .spyOn(mcpServerService, 'list')
    .mockImplementation(async () => ({ items: servers, total: servers.length }) as never);
  return { mcpServer: { getById, list }, service: new McpRuntimeService() };
}

async function getProjectedToolSet(
  service: McpRuntimeService,
  assistant: Assistant,
  selectedToolIds?: readonly string[],
) {
  const entries = await service.getToolEntriesForAssistant(assistant, selectedToolIds);
  return entries.length
    ? Object.fromEntries(entries.map((entry) => [entry.name, entry.tool]))
    : undefined;
}

beforeEach(() => {
  mockCreateMCPClient.mockReset();
});

afterEach(() => {
  // The server-row spies live on a module singleton, so an unrestored one would
  // follow the next test in this file.
  jest.restoreAllMocks();
});

describe('assistant tool preparation', () => {
  it('ignores a server whose endpoint is not http(s)', async () => {
    const { service } = makeService([makeServer({ endpointUrl: 'ftp://a.example/mcp' })]);

    await expect(getProjectedToolSet(service, makeAssistant())).resolves.toBeUndefined();

    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('gives up on a stalling server once the fetch bound expires', async () => {
    // Fake timers so the fetch's 15s guard doesn't outlive the test.
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      // A server that accepts the connect and then stalls forever — the shape
      // that used to hang "send" indefinitely.
      mockCreateMCPClient.mockReturnValue(new Promise(() => undefined));
      const { service } = makeService([makeServer()]);

      let settled = false;
      const request = getProjectedToolSet(service, makeAssistant());
      void request.then(() => {
        settled = true;
      });
      await flush();

      jest.advanceTimersByTime(15 * 1000 - 1);
      await flush();
      expect(settled).toBe(false);

      jest.advanceTimersByTime(1);
      await expect(request).resolves.toBeUndefined();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('fetches tools live for the request', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer()]);

    const tools = await getProjectedToolSet(service, makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search']);
  });

  it('projects only explicitly selected MCP tools for the request', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search', 'read'])));
    const { service } = makeService([makeServer()]);

    const tools = await getProjectedToolSet(service, makeAssistant(), ['mcp__serverone__search']);

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search']);
  });

  it('withholds a disabled tool from the request', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search', 'read'])));
    const { service } = makeService([makeServer({ disabledTools: ['read'] })]);

    const tools = await getProjectedToolSet(service, makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search']);
  });

  it('offers a re-enabled tool on the next request', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search', 'read'])));
    const servers = [makeServer({ disabledTools: ['read'] })];
    const { service } = makeService(servers);
    await getProjectedToolSet(service, makeAssistant());

    servers[0] = makeServer({ disabledTools: [] });
    const tools = await getProjectedToolSet(service, makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search', 'mcp__serverone__read']);
  });

  it('keeps a slow server from holding up the ones that answered', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const slowConnect = deferred<FakeClient>();
      mockCreateMCPClient
        .mockReturnValueOnce(slowConnect.promise)
        .mockResolvedValue(makeClient(makeRawTools(['fast'])));
      const { service } = makeService([
        makeServer({ id: 'slow', name: 'Slow' }),
        makeServer({ endpointUrl: 'https://fast.example/mcp', id: 'fast', name: 'Fast' }),
      ]);

      const request = getProjectedToolSet(service, makeAssistant());
      await flush();
      // The slow server burns its bound; the fast one already answered and must
      // still make it into the request.
      jest.advanceTimersByTime(15 * 1000);

      expect(Object.keys((await request) ?? {})).toEqual(['mcp__fast__fast']);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('relists tools on every request instead of trusting a previous read', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    await getProjectedToolSet(service, makeAssistant());
    await getProjectedToolSet(service, makeAssistant());

    // The connection is pooled, the tool list is not.
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(client.listTools).toHaveBeenCalledTimes(2);
  });

  it('renames without reconnecting', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const servers = [makeServer()];
    const { service } = makeService(servers);
    await getProjectedToolSet(service, makeAssistant());

    servers[0] = makeServer({ name: 'Renamed' });

    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__renamed__search',
    ]);
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(client.close).not.toHaveBeenCalled();
  });

  it('reconnects and refetches when the transport changes', async () => {
    const original = makeClient(makeRawTools(['old']));
    const replacement = makeClient(makeRawTools(['new']));
    mockCreateMCPClient.mockResolvedValueOnce(original).mockResolvedValue(replacement);
    const servers = [makeServer()];
    const { service } = makeService(servers);
    await getProjectedToolSet(service, makeAssistant());

    servers[0] = makeServer({ endpointUrl: 'https://new.example/mcp' });
    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__serverone__new',
    ]);
    expect(original.close).toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
  });

  it('opens one connection when two requests race', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    await Promise.all([
      getProjectedToolSet(service, makeAssistant()),
      getProjectedToolSet(service, makeAssistant()),
    ]);
    await flush();

    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
  });

  it('returns undefined instead of rejecting when the server list read fails', async () => {
    // AiService awaits this with no try/catch of its own, so a throw here would
    // take the whole send down rather than just the tools.
    jest.spyOn(mcpServerService, 'list').mockRejectedValue(new Error('db locked'));
    const service = new McpRuntimeService();

    await expect(getProjectedToolSet(service, makeAssistant())).resolves.toBeUndefined();
  });

  it('drops a server whose listing fails rather than failing the send', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);
    await getProjectedToolSet(service, makeAssistant());

    client.tools.mockRejectedValue(new Error('401 unauthorized'));

    await expect(getProjectedToolSet(service, makeAssistant())).resolves.toBeUndefined();
  });

  it('gives up on a server that accepts the socket and then stalls', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const client = makeClient(makeRawTools(['search']));
      client.tools.mockReturnValue(new Promise(() => undefined));
      mockCreateMCPClient.mockResolvedValue(client);
      const { service } = makeService([makeServer()]);

      const request = getProjectedToolSet(service, makeAssistant());
      await flush();
      jest.advanceTimersByTime(15 * 1000);
      await expect(request).resolves.toBeUndefined();

      // The wedged client is closed rather than pinning the pool slot forever.
      expect(client.close).toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('skips an unreachable server without failing the others', async () => {
    mockCreateMCPClient
      .mockRejectedValueOnce(new Error('server down'))
      .mockResolvedValue(makeClient(makeRawTools(['ping'])));
    const { service } = makeService([
      makeServer({ endpointUrl: 'https://down.example/mcp', id: 'down', name: 'Down' }),
      makeServer({ endpointUrl: 'https://up.example/mcp', id: 'up', name: 'Up' }),
    ]);

    const tools = await getProjectedToolSet(service, makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__up__ping']);
  });

  it('returns undefined when no enabled servers apply', async () => {
    const { service } = makeService([]);

    expect(await getProjectedToolSet(service, makeAssistant())).toBeUndefined();
    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('injects cherry metadata for McpToolPart', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer()]);

    const tools = await getProjectedToolSet(service, makeAssistant());

    expect(tools?.mcp__serverone__search.metadata).toEqual({
      // The wire key above lowercased the server name and cannot be reversed,
      // so the card titles itself from `serverName` and knows the call is MCP
      // from `type`. Drop either and it falls back to that lossy key.
      cherry: {
        tool: { serverId: 'server-1', serverName: 'ServerOne', type: 'mcp' },
      },
    });
  });
});

describe('tool approval policy', () => {
  it('gates every tool behind approval and never defers one', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['read', 'write'])));
    const { service } = makeService([makeServer()]);
    await getProjectedToolSet(service, makeAssistant());

    const entries = await service.getToolEntriesForAssistant(makeAssistant());

    // Approval is fixed application policy, so there is no per-tool exception —
    // and `tool_invoke` refuses approval-gated tools, so deferring one would
    // make it unreachable. Both halves have to stay true together.
    expect(entries.map((entry) => [entry.name, entry.defer, entry.tool.needsApproval])).toEqual([
      ['mcp__serverone__read', 'never', true],
      ['mcp__serverone__write', 'never', true],
    ]);
  });
});

describe('tool execution', () => {
  async function executeTool(service: McpRuntimeService, key: string) {
    const tools = await getProjectedToolSet(service, makeAssistant());
    const tool = tools?.[key];
    return (tool?.execute as (args: unknown, opts: unknown) => Promise<unknown>)({}, {});
  }

  it('does not blame a deleted server when the lookup itself fails', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await getProjectedToolSet(service, makeAssistant());

    mcpServer.getById.mockRejectedValue(new Error('database is locked'));

    await expect(
      (tools?.mcp__serverone__search.execute as (a: unknown, o: unknown) => Promise<unknown>)(
        {},
        {},
      ),
    ).rejects.toThrow('MCP tool ServerOne/search could not verify its server: database is locked');
  });

  it('re-checks the server before running, so a mid-turn disable is honored', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await getProjectedToolSet(service, makeAssistant());

    // Disabled through the mock rather than by mutating the wrap-time row, so
    // only a genuine re-read can observe it.
    mcpServer.getById.mockResolvedValue(makeServer({ isEnabled: false }));

    await expect(
      (tools?.mcp__serverone__search.execute as (a: unknown, o: unknown) => Promise<unknown>)(
        {},
        {},
      ),
    ).rejects.toThrow('is not enabled');
    expect(mcpServer.getById).toHaveBeenCalledWith('server-1');
  });

  it('reports a deleted server from execute rather than from the approval gate', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await getProjectedToolSet(service, makeAssistant());

    mcpServer.getById.mockRejectedValue(DataApiErrorFactory.notFound('McpServer', 'server-1'));

    await expect(
      (tools?.mcp__serverone__search.execute as (a: unknown, o: unknown) => Promise<unknown>)(
        {},
        {},
      ),
    ).rejects.toThrow('MCP server ServerOne is no longer registered');
  });

  it('throws a server/tool-labelled error when the result isError', async () => {
    const rawTools = {
      boom: {
        description: 'boom',
        execute: jest.fn(async () => ({
          content: [{ text: 'kaboom', type: 'text' }],
          isError: true,
        })),
        inputSchema: {},
        type: 'dynamic',
      },
    } as unknown as ToolSet;
    mockCreateMCPClient.mockResolvedValue(makeClient(rawTools));
    const { service } = makeService([makeServer()]);

    await expect(executeTool(service, 'mcp__serverone__boom')).rejects.toThrow(
      'MCP tool ServerOne/boom failed: kaboom',
    );
  });

  it('drops the pooled client when a call fails, so the next use reconnects', async () => {
    const client = makeClient(
      makeRawTool('boom', async () => {
        throw new Error('transport gone');
      }),
    );
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    await expect(executeTool(service, 'mcp__serverone__boom')).rejects.toThrow(
      'MCP tool ServerOne/boom failed: transport gone',
    );
    expect(client.close).toHaveBeenCalled();

    // Cache was dropped alongside the client, so the next turn refetches.
    await getProjectedToolSet(service, makeAssistant());
    await flush();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
  });

  it('stamps the result with its source the way desktop does', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer()]);

    const result = (await executeTool(service, 'mcp__serverone__search')) as {
      metadata: unknown;
    };

    // Desktop stamps the same shape on its own results (`mcpTools.ts`), so a
    // tool part written by either end carries the same `output.metadata`. The
    // next test is what keeps this off the model.
    expect(result.metadata).toEqual({
      serverId: 'server-1',
      serverName: 'ServerOne',
      type: 'mcp',
    });
  });

  it('compresses output to text for the model', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer()]);
    const tools = await getProjectedToolSet(service, makeAssistant());

    const modelOutput = tools?.mcp__serverone__search.toModelOutput?.({
      input: {},
      // The shape `wrappedExecute` actually returns, source stamp included —
      // summarising anything but `content` would spend tokens on plumbing the
      // model has no use for.
      output: {
        content: [{ text: 'summary', type: 'text' }],
        metadata: { serverId: 'server-1', serverName: 'ServerOne', type: 'mcp' },
      },
      toolCallId: 'call-1',
    });

    expect(modelOutput).toEqual({ type: 'text', value: 'summary' });
  });

  it('emits a string for the model even when the output is missing', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer()]);
    const tools = await getProjectedToolSet(service, makeAssistant());

    const modelOutput = tools?.mcp__serverone__search.toModelOutput?.({
      input: {},
      output: undefined,
      toolCallId: 'call-1',
    });

    // Not '': an empty string reads to the model as a successful empty answer.
    expect(modelOutput).toEqual({ type: 'text', value: '[MCP tool returned no result]' });
  });

  it('fails instead of reporting an empty success when the call returns nothing', async () => {
    const client = makeClient(makeRawTool('search', async () => undefined));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    await expect(executeTool(service, 'mcp__serverone__search')).rejects.toThrow(
      'MCP tool ServerOne/search returned no result',
    );
  });

  it('warns the model not to blind-retry a call it only stopped waiting for', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const client = makeClient(makeRawTool('slow', () => new Promise(() => undefined)));
      mockCreateMCPClient.mockResolvedValue(client);
      const { service } = makeService([makeServer()]);
      const tools = await getProjectedToolSet(service, makeAssistant());

      const call = (
        tools?.mcp__serverone__slow.execute as (a: unknown, o: unknown) => Promise<unknown>
      )({}, {});
      const assertion = expect(call).rejects.toThrow(
        /timed out after 60000ms\. The server may still be processing it/,
      );
      await flush();
      jest.advanceTimersByTime(60 * 1000);
      await assertion;

      // Nothing cancels the remote work, so the connection is treated as wedged.
      expect(client.close).toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('labels the failure with the current name without rebuilding the tool cache', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const client = makeClient(makeRawTool('slow', () => new Promise(() => undefined)));
      mockCreateMCPClient.mockResolvedValue(client);
      const { mcpServer, service } = makeService([makeServer()]);
      const tools = await getProjectedToolSet(service, makeAssistant());
      mcpServer.getById.mockResolvedValue(makeServer({ name: 'Renamed' }));

      const call = (
        tools?.mcp__serverone__slow.execute as (a: unknown, o: unknown) => Promise<unknown>
      )({}, {});
      const assertion = expect(call).rejects.toThrow(
        /MCP tool Renamed\/slow timed out after 60000ms/,
      );
      await flush();
      jest.advanceTimersByTime(60 * 1000);

      await assertion;
      expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
      expect(client.tools).toHaveBeenCalledTimes(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

describe('getServerInfo', () => {
  it('returns initialization metadata and closes the throwaway client', async () => {
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

  it('times out initialization and closes a client that connects late', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      let settleConnect: ((client: FakeClient) => void) | undefined;
      const client = makeClient(makeRawTools(['a']));
      mockCreateMCPClient.mockReturnValue(
        new Promise<FakeClient>((resolve) => {
          settleConnect = resolve;
        }),
      );
      const { service } = makeService([]);

      const request = service.getServerInfo({ endpointUrl: 'https://x.example/mcp' });
      const assertion = expect(request).rejects.toThrow('MCP server info timed out after 15000ms');
      jest.advanceTimersByTime(15 * 1000);
      await assertion;

      settleConnect?.(client);
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

  it('reads the stored row for the id instead of trusting the caller', async () => {
    const { mcpServer, service } = makeService([makeServer()]);
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));

    await service.listTools('server-1');

    expect(mcpServer.getById).toHaveBeenCalledWith('server-1');
  });

  it('reconnects once when the pooled client has gone stale', async () => {
    const stale = makeClient(makeRawTools(['search']));
    stale.tools.mockRejectedValue(new Error('session expired'));
    const fresh = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    const server = makeServer();
    const { service } = makeService([server]);

    const tools = await service.listTools(server.id);

    expect(tools).toEqual([{ description: 'desc search', name: 'search' }]);
    expect(stale.close).toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
  });

  it('loads every tools/list page before caching tools and counting them', async () => {
    const client = makeClient(makeRawTools([]));
    const firstPage = makeToolDefinitions(makeRawTools(['search']));
    const secondPage = makeToolDefinitions(makeRawTools(['open']));
    client.listTools
      .mockResolvedValueOnce({ nextCursor: 'page-2', tools: firstPage })
      .mockResolvedValueOnce({ tools: secondPage });
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    await expect(service.listTools(server.id)).resolves.toEqual([
      { description: 'desc search', name: 'search' },
      { description: 'desc open', name: 'open' },
    ]);
    await expect(service.getRuntimeSummaries([server])).resolves.toMatchObject({
      [server.id]: {
        serverName: 'test-server',
        serverTitle: 'Test MCP',
        serverVersion: '1.2.3',
        state: 'connected',
        toolCount: 2,
      },
    });
    expect(client.listTools).toHaveBeenNthCalledWith(1, {
      options: { signal: expect.any(AbortSignal) },
    });
    expect(client.listTools).toHaveBeenNthCalledWith(2, {
      options: { signal: expect.any(AbortSignal) },
      params: { cursor: 'page-2' },
    });
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

  it('surfaces the failure when the reconnect fails too', async () => {
    const client = makeClient(makeRawTools(['search']));
    client.tools.mockRejectedValue(new Error('401 unauthorized'));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    // The settings screen renders this message — swallowing it would leave the
    // user with "failed to load tools" and no way to tell why.
    await expect(service.listTools(server.id)).rejects.toThrow('401 unauthorized');
  });

  it('does not retry a tools listing invalidated by a configuration change', async () => {
    const client = makeClient(makeRawTools(['search']));
    client.tools.mockReturnValue(new Promise(() => undefined));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    const listing = service.listTools(server.id);
    const assertion = expect(listing).rejects.toThrow('was invalidated');
    await flush();
    service.invalidateServer(server.id);

    await assertion;
    expect(client.close).toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
  });
});

describe('runtime summaries', () => {
  it('reports a server nothing has read yet without connecting to it', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const server = makeServer();
    const { service } = makeService([server]);

    // TODO(mcp-cache): the list no longer prewarms, so a row stays `connecting`
    // until something reads it. A replacement strategy has to answer this.
    await expect(service.getRuntimeSummaries([server])).resolves.toEqual({
      [server.id]: { state: 'connecting' },
    });
    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('reports a failure recorded by an earlier read without rejecting', async () => {
    const client = makeClient(makeRawTools([]));
    client.tools.mockRejectedValue(new Error('401 unauthorized'));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    await expect(service.listTools(server.id)).rejects.toThrow('401 unauthorized');

    await expect(service.getRuntimeSummaries([server])).resolves.toEqual({
      [server.id]: {
        lastError: '401 unauthorized',
        state: 'error',
      },
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
      [server.id]: {
        serverName: 'test-server',
        serverTitle: 'Test MCP',
        serverVersion: '1.2.3',
        state: 'disabled',
        toolCount: 1,
      },
    });
  });
});

describe('invalidateServer', () => {
  it('does not let an in-flight connect repopulate the pool', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      let settleConnect: ((client: FakeClient) => void) | undefined;
      const client = makeClient(makeRawTools(['search']));
      mockCreateMCPClient.mockReturnValueOnce(
        new Promise<FakeClient>((resolve) => {
          settleConnect = resolve;
        }),
      );
      const { service } = makeService([makeServer()]);

      const request = getProjectedToolSet(service, makeAssistant());
      await flush();
      // The fetch bound, and nothing else — no warm budget, no refresh timer.
      expect(jest.getTimerCount()).toBe(1);
      service.invalidateServer('server-1');
      await request;
      expect(jest.getTimerCount()).toBe(0);
      settleConnect?.(client);
      await flush();

      // The evicted connect closed itself instead of landing in the pool, and it
      // was never asked for tools.
      expect(client.close).toHaveBeenCalled();
      expect(client.tools).not.toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('does not discard an unrelated server’s in-flight refresh', async () => {
    const other = makeClient(makeRawTools(['ping']));
    let settleOther: ((client: FakeClient) => void) | undefined;
    mockCreateMCPClient.mockReturnValue(
      new Promise<FakeClient>((resolve) => {
        settleOther = resolve;
      }),
    );
    const { service } = makeService([
      makeServer({ endpointUrl: 'https://b.example/mcp', id: 'other', name: 'Other' }),
    ]);

    const request = getProjectedToolSet(service, makeAssistant());
    await flush();
    // Saving one server must not throw away every other server's warm-up.
    service.invalidateServer('server-1');
    settleOther?.(other);
    await request;
    await flush();

    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__other__ping',
    ]);
  });

  it('lets a new refresh start after invalidating one that was in flight', async () => {
    // Connected, but still waiting on tools/list when the config changes — the
    // window where a leftover pendingRefreshes entry would swallow every later
    // refresh until the stalled one finally settles.
    const stalled = makeClient(makeRawTools(['search']));
    stalled.tools.mockReturnValue(new Promise(() => undefined));
    const replacement = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValueOnce(stalled).mockResolvedValue(replacement);
    const { service } = makeService([makeServer()]);

    const firstRequest = getProjectedToolSet(service, makeAssistant());
    await flush();
    expect(stalled.tools).toHaveBeenCalled();

    service.invalidateServer('server-1');
    await firstRequest;
    await getProjectedToolSet(service, makeAssistant());
    await flush();

    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__serverone__search',
    ]);
    expect(replacement.tools).toHaveBeenCalled();
  });

  it('does not let a late tools response overwrite the replacement cache', async () => {
    let settleOldTools: ((tools: ToolSet) => void) | undefined;
    const stale = makeClient(makeRawTools(['old']));
    stale.tools.mockReturnValue(
      new Promise<ToolSet>((resolve) => {
        settleOldTools = resolve;
      }),
    );
    const replacement = makeClient(makeRawTools(['new']));
    mockCreateMCPClient.mockResolvedValueOnce(stale).mockResolvedValue(replacement);
    const { service } = makeService([makeServer()]);

    const firstRequest = getProjectedToolSet(service, makeAssistant());
    await flush();
    service.invalidateServer('server-1');
    await firstRequest;
    await getProjectedToolSet(service, makeAssistant());
    await flush();
    settleOldTools?.(makeRawTools(['old']));
    await flush();

    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__serverone__new',
    ]);
    expect(stale.close).toHaveBeenCalled();
  });
});

describe('dispose', () => {
  it('closes the pooled client', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);
    await getProjectedToolSet(service, makeAssistant());

    await service._doStop();

    expect(client.close).toHaveBeenCalled();
  });

  it('cancels an in-flight connect and closes the client that lands after it', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      let settleConnect: ((client: FakeClient) => void) | undefined;
      const client = makeClient(makeRawTools(['search']));
      mockCreateMCPClient.mockReturnValueOnce(
        new Promise<FakeClient>((resolve) => {
          settleConnect = resolve;
        }),
      );
      const { service } = makeService([makeServer()]);

      const request = getProjectedToolSet(service, makeAssistant());
      await flush();
      expect(jest.getTimerCount()).toBe(1);

      await service._doStop();
      await request;

      expect(jest.getTimerCount()).toBe(0);
      settleConnect?.(client);
      await flush();
      expect(client.close).toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('drops the snapshots it was keeping for disabled servers', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);
    await getProjectedToolSet(service, makeAssistant());
    service.invalidateServer(server.id, { preserveSnapshot: true });
    expect(retainedSnapshotCount(service)).toBe(1);

    await service._doStop();

    expect(retainedSnapshotCount(service)).toBe(0);
  });
});

/**
 * Snapshots deliberately outlive their connection so a disabled server can still
 * show its last known metadata; stopping the service has to clear them, and no
 * public summary exposes whether it did.
 */
function retainedSnapshotCount(service: McpRuntimeService): number {
  const internals = service as unknown as { runtimeSnapshots: Map<string, unknown> };
  return internals.runtimeSnapshots.size;
}
