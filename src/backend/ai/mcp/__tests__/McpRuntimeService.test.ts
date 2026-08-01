import type { ToolSet } from 'ai';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/types';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import { DEFAULT_ASSISTANT_SETTINGS } from '@cherrystudio/universal/data/types/assistant';
import type { StreamableHttpMcpServer } from '@cherrystudio/universal/data/types/mcpServer';
import { McpRuntimeService } from '../McpRuntimeService';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockCreateMCPClient = jest.fn();
jest.mock('@ai-sdk/mcp', () => ({
  createMCPClient: (...args: unknown[]) => mockCreateMCPClient(...args),
}));

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

function makeServer(overrides: Partial<StreamableHttpMcpServer> = {}): StreamableHttpMcpServer {
  return {
    baseUrl: 'https://a.example/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools: [],
    disabledTools: [],
    headers: {},
    id: 'server-1',
    isActive: true,
    name: 'ServerOne',
    type: 'streamableHttp',
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
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'A',
    orderKey: 'a0',
    prompt: '',
    settings: { ...DEFAULT_ASSISTANT_SETTINGS, mcpMode: 'auto' },
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeRawTools(names: string[]): ToolSet {
  return Object.fromEntries(
    names.map((name) => [
      name,
      {
        description: `desc ${name}`,
        execute: jest.fn(async () => {
          // A macrotask, not just a microtask: a wrongly-computed 0ms timeout
          // loses the race against a promise that resolves on the microtask
          // queue, which would make the `timeout: 0` test pass either way.
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
    [name]: { description: name, execute: jest.fn(execute), inputSchema: {}, type: 'dynamic' },
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
  client.listTools.mockImplementation(async () => ({
    tools: makeToolDefinitions(await client.tools()),
  }));
  client.toolsFromDefinitions.mockImplementation(
    ({ tools: definitions }: { tools: ReturnType<typeof makeToolDefinitions> }) =>
      Object.fromEntries(definitions.map((definition) => [definition.name, definition.rawTool])),
  );
  return client;
}

function makeService(servers: StreamableHttpMcpServer[]) {
  const mcpServer = {
    // Hand out a copy: sharing the row object with the caller would let a test
    // mutate what production code already captured, and pass without the code
    // ever re-reading anything.
    getById: jest.fn(async (id: string) => {
      const found = servers.find((server) => server.id === id);
      if (!found) throw DataApiErrorFactory.notFound('McpServer', id);
      return { ...found };
    }),
    list: jest.fn(async () => ({ items: servers, total: servers.length })),
  };
  const service = new McpRuntimeService({ mcpServer: mcpServer as never });
  return { mcpServer, service };
}

/** Cold cache → warm it the way the chat path does, then read it back. */
async function warmedToolSet(service: McpRuntimeService, assistant = makeAssistant()) {
  await getProjectedToolSet(service, assistant);
  await flush();
  return getProjectedToolSet(service, assistant);
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

describe('assistant tool preparation', () => {
  it('ignores a synchronized server without a URL', async () => {
    const { service } = makeService([makeServer({ baseUrl: '' })]);

    await expect(getProjectedToolSet(service, makeAssistant())).resolves.toBeUndefined();

    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('waits at most three seconds for a cold server', async () => {
    // Fake timers so the refresh's 15s guard doesn't outlive the test.
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

      jest.advanceTimersByTime(2999);
      await Promise.resolve();
      expect(settled).toBe(false);

      jest.advanceTimersByTime(1);
      await expect(request).resolves.toBeUndefined();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('includes tools in the first request when the cold warm completes in time', async () => {
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

  it('uses one three-second budget for all servers and keeps late refreshes for the next request', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const slowConnect = deferred<FakeClient>();
      mockCreateMCPClient
        .mockReturnValueOnce(slowConnect.promise)
        .mockResolvedValueOnce(makeClient(makeRawTools(['fast'])));
      const { service } = makeService([
        makeServer({ id: 'slow', name: 'Slow' }),
        makeServer({ baseUrl: 'https://fast.example/mcp', id: 'fast', name: 'Fast' }),
      ]);

      const request = getProjectedToolSet(service, makeAssistant());
      await flush();
      jest.advanceTimersByTime(3 * 1000);

      expect(Object.keys((await request) ?? {})).toEqual(['mcp__fast__fast']);

      slowConnect.resolve(makeClient(makeRawTools(['late'])));
      await flush();
      expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
        'mcp__slow__late',
        'mcp__fast__fast',
      ]);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('reuses the cache instead of reconnecting', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    await warmedToolSet(service);
    await getProjectedToolSet(service, makeAssistant());

    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(client.tools).toHaveBeenCalledTimes(1);
  });

  it('uses policy and display updates without reconnecting or relisting tools', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const servers = [makeServer()];
    const { service } = makeService(servers);
    await warmedToolSet(service);

    servers[0] = makeServer({ disabledTools: ['search'], name: 'Renamed', timeout: 5 });
    expect(await getProjectedToolSet(service, makeAssistant())).toBeUndefined();

    servers[0] = makeServer({ name: 'Renamed', timeout: 5 });
    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__renamed__search',
    ]);
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(client.tools).toHaveBeenCalledTimes(1);
    expect(client.close).not.toHaveBeenCalled();
  });

  it('reconnects and refetches when the transport changes', async () => {
    const original = makeClient(makeRawTools(['old']));
    const replacement = makeClient(makeRawTools(['new']));
    mockCreateMCPClient.mockResolvedValueOnce(original).mockResolvedValue(replacement);
    const servers = [makeServer()];
    const { service } = makeService(servers);
    await warmedToolSet(service);

    servers[0] = makeServer({ baseUrl: 'https://new.example/mcp' });
    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__serverone__new',
    ]);
    expect(original.close).toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
  });

  it('keeps serving stale tools while revalidating past the TTL', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const client = makeClient(makeRawTools(['search']));
      mockCreateMCPClient.mockResolvedValue(client);
      const { service } = makeService([makeServer()]);
      await warmedToolSet(service);
      expect(client.tools).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(6 * 60 * 1000);
      const tools = await getProjectedToolSet(service, makeAssistant());
      await flush();

      expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search']);
      // Stale reads must also *trigger* the refresh, or a dead server's tool
      // list would be served forever.
      expect(client.tools).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fetches once when two requests race on a cold cache', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    await Promise.all([
      getProjectedToolSet(service, makeAssistant()),
      getProjectedToolSet(service, makeAssistant()),
    ]);
    await flush();

    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(client.tools).toHaveBeenCalledTimes(1);
  });

  it('returns undefined instead of rejecting when the server list read fails', async () => {
    // AiService awaits this with no try/catch of its own, so a throw here would
    // take the whole send down rather than just the tools.
    const service = new McpRuntimeService({
      mcpServer: { list: jest.fn(async () => Promise.reject(new Error('db locked'))) } as never,
    });

    await expect(getProjectedToolSet(service, makeAssistant())).resolves.toBeUndefined();
  });

  it('keeps the last good tools when a refresh fails, and backs off', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const client = makeClient(makeRawTools(['search']));
      mockCreateMCPClient.mockResolvedValue(client);
      const { service } = makeService([makeServer()]);
      await warmedToolSet(service);

      client.tools.mockRejectedValue(new Error('401 unauthorized'));
      jest.advanceTimersByTime(6 * 60 * 1000);
      await getProjectedToolSet(service, makeAssistant());
      await flush();
      expect(client.tools).toHaveBeenCalledTimes(2);

      // Read *after* the failure has landed: a blip must not silently strip a
      // working server's tools, and the cached handles are bound to a client
      // that is still open.
      const tools = await getProjectedToolSet(service, makeAssistant());
      expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search']);
      expect(client.close).not.toHaveBeenCalled();

      // Still inside the backoff window: no third attempt.
      jest.advanceTimersByTime(10 * 1000);
      await getProjectedToolSet(service, makeAssistant());
      await flush();
      expect(client.tools).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
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
      jest.advanceTimersByTime(3 * 1000);
      await expect(request).resolves.toBeUndefined();
      jest.advanceTimersByTime(12 * 1000);
      await flush();

      // The wedged client is closed rather than pinning the pool slot forever.
      expect(client.close).toHaveBeenCalled();
      expect(await getProjectedToolSet(service, makeAssistant())).toBeUndefined();
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
      makeServer({ baseUrl: 'https://down.example/mcp', id: 'down', name: 'Down' }),
      makeServer({ baseUrl: 'https://up.example/mcp', id: 'up', name: 'Up' }),
    ]);

    const tools = await warmedToolSet(service);

    expect(Object.keys(tools ?? {})).toEqual(['mcp__up__ping']);
  });

  it('returns undefined when no active servers apply', async () => {
    const { service } = makeService([]);

    expect(await getProjectedToolSet(service, makeAssistant())).toBeUndefined();
    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('injects cherry metadata for McpToolPart', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer()]);

    const tools = await warmedToolSet(service);

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

describe('disabledTools filtering', () => {
  it('drops tools matched by raw name', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['keep', 'drop'])));
    const { service } = makeService([makeServer({ disabledTools: ['drop'] })]);

    const tools = await warmedToolSet(service);

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__keep']);
  });

  it('gates tools listed in disabledAutoApproveTools behind needsApproval', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['guarded', 'free'])));
    const { service } = makeService([makeServer({ disabledAutoApproveTools: ['guarded'] })]);
    const tools = await warmedToolSet(service);

    const needsApproval = async (tool: unknown) =>
      (tool as { needsApproval: () => Promise<boolean> }).needsApproval();

    await expect(needsApproval(tools?.mcp__serverone__guarded)).resolves.toBe(true);
    await expect(needsApproval(tools?.mcp__serverone__free)).resolves.toBe(false);

    const entries = await service.getToolEntriesForAssistant(makeAssistant());
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          defer: 'never',
          name: 'mcp__serverone__guarded',
          namespace: 'mcp:ServerOne',
        }),
        expect.objectContaining({
          defer: 'auto',
          name: 'mcp__serverone__free',
          namespace: 'mcp:ServerOne',
        }),
      ]),
    );
  });

  it('re-reads the server so an approval toggle mid-turn is honoured', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await warmedToolSet(service);
    const tool = tools?.mcp__serverone__search as unknown as {
      needsApproval: () => Promise<boolean>;
    };
    await expect(tool.needsApproval()).resolves.toBe(false);

    // The user requires approval after this ToolSet was built. A fresh object,
    // not a mutation of the wrap-time one — otherwise reading the stale
    // snapshot would pass this test too.
    mcpServer.getById.mockResolvedValue(
      makeServer({ disabledAutoApproveTools: ['mcp__serverone__*'] }),
    );

    await expect(tool.needsApproval()).resolves.toBe(true);
    expect(mcpServer.getById).toHaveBeenCalledWith('server-1', 'streamableHttp');
  });

  it('requires approval when the lookup fails rather than trusting a stale snapshot', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await warmedToolSet(service);

    mcpServer.getById.mockRejectedValue(new Error('database is locked'));

    // The snapshot says "auto-approve", but it may simply predate the rule the
    // user just added — a security gate that cannot read its rules must ask.
    const tool = tools?.mcp__serverone__search as unknown as {
      needsApproval: () => Promise<boolean>;
    };
    await expect(tool.needsApproval()).resolves.toBe(true);
  });

  it('does not ask to approve a deleted server, leaving execute to report it', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await warmedToolSet(service);

    mcpServer.getById.mockRejectedValue(DataApiErrorFactory.notFound('McpServer', 'server-1'));

    const tool = tools?.mcp__serverone__search as unknown as {
      execute: (args: unknown, opts: unknown) => Promise<unknown>;
      needsApproval: () => Promise<boolean>;
    };

    // The mirror image of the test above, and swapping the two is a security
    // regression: NOT_FOUND must pass the gate so the user sees why the call
    // really failed instead of approving something that cannot run, while any
    // other read failure must still fail closed.
    await expect(tool.needsApproval()).resolves.toBe(false);
    await expect(tool.execute({}, {})).rejects.toThrow(
      'MCP server ServerOne is no longer registered',
    );
  });

  it('honors wire-id and wildcard entries (desktop rule parity)', async () => {
    // Anchor first: without any rule this server contributes two tools, so the
    // wildcard assertion below can't pass just because the cache stayed cold.
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['alpha', 'beta'])));
    expect(Object.keys((await warmedToolSet(makeService([makeServer()]).service)) ?? {})).toEqual([
      'mcp__serverone__alpha',
      'mcp__serverone__beta',
    ]);

    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['alpha', 'beta'])));
    const wildcard = makeService([makeServer({ disabledTools: ['mcp__serverone__*'] })]);

    expect(await warmedToolSet(wildcard.service)).toBeUndefined();

    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['alpha', 'beta'])));
    const wireId = makeService([makeServer({ disabledTools: ['mcp__serverone__alpha'] })]);

    expect(Object.keys((await warmedToolSet(wireId.service)) ?? {})).toEqual([
      'mcp__serverone__beta',
    ]);
  });
});

describe('prewarmActiveServers', () => {
  it('does not connect to a synchronized server without a URL', async () => {
    const { service } = makeService([makeServer({ baseUrl: '' })]);

    await service.prewarmActiveServers();

    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('fills the cache so the first chat request already has tools', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer()]);

    await service.prewarmActiveServers();
    await flush();

    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__serverone__search',
    ]);
  });

  it('warms active servers in batches of three', async () => {
    const releases: (() => void)[] = [];
    let active = 0;
    let maxActive = 0;
    mockCreateMCPClient.mockImplementation(async () => {
      const client = makeClient(makeRawTools(['search']));
      client.tools.mockImplementation(
        () =>
          new Promise<ToolSet>((resolve) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            releases.push(() => {
              active -= 1;
              resolve(makeRawTools(['search']));
            });
          }),
      );
      return client;
    });
    const servers = Array.from({ length: 6 }, (_, index) =>
      makeServer({
        baseUrl: `https://${index}.example/mcp`,
        id: `server-${index}`,
        name: `Server${index}`,
      }),
    );
    const { service } = makeService(servers);

    const prewarm = service.prewarmActiveServers();
    await flush();
    expect(releases).toHaveLength(3);

    releases.slice(0, 3).forEach((release) => {
      release();
    });
    await flush();
    expect(releases).toHaveLength(6);
    expect(maxActive).toBe(3);

    releases.slice(3).forEach((release) => {
      release();
    });
    await prewarm;
  });

  it('shares one active prewarm run across concurrent callers', async () => {
    const tools = deferred<ToolSet>();
    const client = makeClient(makeRawTools(['search']));
    client.tools.mockReturnValue(tools.promise);
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    const first = service.prewarmActiveServers();
    const second = service.prewarmActiveServers();
    expect(second).toBe(first);
    await flush();

    tools.resolve(makeRawTools(['search']));
    await Promise.all([first, second]);
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(client.tools).toHaveBeenCalledTimes(1);
  });

  it('never rejects when listing servers fails', async () => {
    const service = new McpRuntimeService({
      mcpServer: { list: jest.fn(async () => Promise.reject(new Error('db down'))) } as never,
    });

    await expect(service.prewarmActiveServers()).resolves.toBeUndefined();
  });
});

describe('tool execution', () => {
  async function executeTool(service: McpRuntimeService, key: string) {
    const tools = await warmedToolSet(service);
    const tool = tools?.[key];
    return (tool?.execute as (args: unknown, opts: unknown) => Promise<unknown>)({}, {});
  }

  it('re-checks the server before running, so a mid-turn disable is honored', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await warmedToolSet(service);

    // The user disables the tool after this ToolSet was built. A fresh object,
    // not a mutation of the wrap-time one — otherwise reading the stale
    // snapshot would pass this test too.
    mcpServer.getById.mockResolvedValue(makeServer({ disabledTools: ['search'] }));
    const tool = tools?.mcp__serverone__search;

    await expect(
      (tool?.execute as (args: unknown, opts: unknown) => Promise<unknown>)({}, {}),
    ).rejects.toThrow('MCP tool ServerOne/search is disabled');
    expect(mcpServer.getById).toHaveBeenCalledWith('server-1', 'streamableHttp');
  });

  it('does not blame a deleted server when the lookup itself fails', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await warmedToolSet(service);

    mcpServer.getById.mockRejectedValue(new Error('database is locked'));

    await expect(
      (tools?.mcp__serverone__search.execute as (a: unknown, o: unknown) => Promise<unknown>)(
        {},
        {},
      ),
    ).rejects.toThrow('MCP tool ServerOne/search could not verify its server: database is locked');
  });

  it('refuses to run against a deactivated server', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { mcpServer, service } = makeService([makeServer()]);
    const tools = await warmedToolSet(service);

    // Deactivated through the mock rather than by mutating the wrap-time row,
    // so only a genuine re-read can observe it.
    mcpServer.getById.mockResolvedValue(makeServer({ isActive: false }));

    await expect(
      (tools?.mcp__serverone__search.execute as (a: unknown, o: unknown) => Promise<unknown>)(
        {},
        {},
      ),
    ).rejects.toThrow('is not active');
    expect(mcpServer.getById).toHaveBeenCalledWith('server-1', 'streamableHttp');
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

  it('treats a stored timeout of 0 as unset instead of failing instantly', async () => {
    mockCreateMCPClient.mockResolvedValue(makeClient(makeRawTools(['search'])));
    const { service } = makeService([makeServer({ timeout: 0 })]);

    await expect(executeTool(service, 'mcp__serverone__search')).resolves.toEqual({
      content: [{ text: 'ok search', type: 'text' }],
      metadata: { serverId: 'server-1', serverName: 'ServerOne', type: 'mcp' },
    });
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
    const tools = await warmedToolSet(service);

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
    const tools = await warmedToolSet(service);

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
      const { service } = makeService([makeServer({ timeout: 30 })]);
      const tools = await warmedToolSet(service);

      const call = (
        tools?.mcp__serverone__slow.execute as (a: unknown, o: unknown) => Promise<unknown>
      )({}, {});
      const assertion = expect(call).rejects.toThrow(
        /timed out after 30000ms\. The server may still be processing it/,
      );
      await flush();
      jest.advanceTimersByTime(30 * 1000);
      await assertion;

      // Nothing cancels the remote work, so the connection is treated as wedged.
      expect(client.close).toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('uses the latest stored timeout without rebuilding the tool cache', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const client = makeClient(makeRawTool('slow', () => new Promise(() => undefined)));
      mockCreateMCPClient.mockResolvedValue(client);
      const { mcpServer, service } = makeService([makeServer({ timeout: 60 })]);
      const tools = await warmedToolSet(service);
      mcpServer.getById.mockResolvedValue(makeServer({ name: 'Renamed', timeout: 1 }));

      const call = (
        tools?.mcp__serverone__slow.execute as (a: unknown, o: unknown) => Promise<unknown>
      )({}, {});
      const assertion = expect(call).rejects.toThrow(
        /MCP tool Renamed\/slow timed out after 1000ms/,
      );
      await flush();
      jest.advanceTimersByTime(1000);

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

    await expect(service.getServerInfo({ baseUrl: 'https://x.example/mcp' })).resolves.toEqual({
      instructions: 'Use this server to search documentation.',
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

      const request = service.getServerInfo({ baseUrl: 'https://x.example/mcp' });
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

describe('testConnection', () => {
  it('returns tool summaries and always closes the throwaway client', async () => {
    const client = makeClient(makeRawTools(['a', 'b']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([]);

    const result = await service.testConnection({ baseUrl: 'https://x.example/mcp' });

    expect(result.map((t) => t.name)).toEqual(['a', 'b']);
    expect(client.close).toHaveBeenCalled();
    // Testing an unsaved form must not leave anything behind in the pool.
    expect(await getProjectedToolSet(service, makeAssistant())).toBeUndefined();
  });

  it('closes the client when the connected server then rejects the listing', async () => {
    const client = makeClient(makeRawTools(['a']));
    client.tools.mockRejectedValue(new Error('403 forbidden'));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([]);

    await expect(service.testConnection({ baseUrl: 'https://x.example/mcp' })).rejects.toThrow(
      '403 forbidden',
    );
    expect(client.close).toHaveBeenCalled();
  });

  it('times out client initialization and closes a client that connects late', async () => {
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

      const request = service.testConnection({ baseUrl: 'https://x.example/mcp' });
      const assertion = expect(request).rejects.toThrow(
        'MCP connection test timed out after 15000ms',
      );
      jest.advanceTimersByTime(15 * 1000);
      await assertion;

      settleConnect?.(client);
      await flush();
      expect(client.close).toHaveBeenCalled();
      expect(client.tools).not.toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

describe('listToolsForServer', () => {
  it('rejects a server without a URL before opening a connection', async () => {
    const server = makeServer({ baseUrl: '' });
    const { service } = makeService([server]);

    await expect(service.listToolsForServer(server)).rejects.toThrow('has no valid HTTP URL');
    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });

  it('reconnects once when the pooled client has gone stale', async () => {
    const stale = makeClient(makeRawTools(['search']));
    stale.tools.mockRejectedValue(new Error('session expired'));
    const fresh = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    const server = makeServer();
    const { service } = makeService([server]);

    const tools = await service.listToolsForServer(server);

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

    await expect(service.listToolsForServer(server)).resolves.toEqual([
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
    expect(client.listTools).toHaveBeenNthCalledWith(1, undefined);
    expect(client.listTools).toHaveBeenNthCalledWith(2, { params: { cursor: 'page-2' } });
  });

  it('shares an in-flight warm with an explicit settings listing', async () => {
    const tools = deferred<ToolSet>();
    const client = makeClient(makeRawTools(['search']));
    client.tools.mockReturnValue(tools.promise);
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    const warm = service.warmToolsCache(server);
    await flush();
    const listing = service.listToolsForServer(server);
    tools.resolve(makeRawTools(['search']));

    await expect(warm).resolves.toBeUndefined();
    await expect(listing).resolves.toEqual([{ description: 'desc search', name: 'search' }]);
    expect(client.tools).toHaveBeenCalledTimes(1);
  });

  it('does not restart an old transport when a shared warm is invalidated', async () => {
    const tools = deferred<ToolSet>();
    const client = makeClient(makeRawTools(['search']));
    client.tools.mockReturnValue(tools.promise);
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    const warm = service.warmToolsCache(server);
    await flush();
    const listing = service.listToolsForServer(server);
    service.invalidateServer(server.id);

    await expect(warm).resolves.toBeUndefined();
    await expect(listing).rejects.toThrow('was invalidated while listing tools');
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
    await expect(service.listToolsForServer(server)).rejects.toThrow('401 unauthorized');
  });

  it('does not retry a tools listing invalidated by a configuration change', async () => {
    const client = makeClient(makeRawTools(['search']));
    client.tools.mockReturnValue(new Promise(() => undefined));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

    const listing = service.listToolsForServer(server);
    const assertion = expect(listing).rejects.toThrow('was invalidated');
    await flush();
    service.invalidateServer(server.id);

    await assertion;
    expect(client.close).toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
  });
});

describe('runtime summaries', () => {
  it('reports connection failures without rejecting the list query', async () => {
    const client = makeClient(makeRawTools([]));
    client.tools.mockRejectedValue(new Error('401 unauthorized'));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer();
    const { service } = makeService([server]);

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

    await service.getRuntimeSummaries([server]);
    service.invalidateServer(server.id, { preserveSnapshot: true });

    await expect(
      service.getRuntimeSummaries([{ ...server, isActive: false }]),
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
      expect(jest.getTimerCount()).toBe(2);
      service.invalidateServer('server-1');
      await request;
      expect(jest.getTimerCount()).toBe(0);
      settleConnect?.(client);
      await flush();

      // The evicted connect closed itself instead of landing in the pool, and it
      // was never asked for tools, so nothing could refill the cleared cache.
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
      makeServer({ baseUrl: 'https://b.example/mcp', id: 'other', name: 'Other' }),
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

describe('transport fingerprint', () => {
  it('reconnects when only a header changes', async () => {
    const original = makeClient(makeRawTools(['old']));
    const replacement = makeClient(makeRawTools(['new']));
    mockCreateMCPClient.mockResolvedValueOnce(original).mockResolvedValue(replacement);
    const servers = [makeServer({ headers: { Authorization: 'Bearer old-token' } })];
    const { service } = makeService(servers);
    await warmedToolSet(service);

    servers[0] = makeServer({ headers: { Authorization: 'Bearer new-token' } });

    expect(Object.keys((await getProjectedToolSet(service, makeAssistant())) ?? {})).toEqual([
      'mcp__serverone__new',
    ]);
    expect(original.close).toHaveBeenCalled();
  });

  it('does not retain the header values it fingerprints', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const server = makeServer({ headers: { Authorization: 'Bearer super-secret-token' } });
    const { service } = makeService([server]);
    await warmedToolSet(service);

    // A deactivated server keeps its snapshot, so the fingerprint outlives the
    // connection that needed the token.
    service.invalidateServer(server.id, { preserveSnapshot: true });

    const retained = retainedFingerprints(service);
    expect(retained).not.toEqual([]);
    expect(retained.join('|')).not.toContain('super-secret-token');
    expect(retained.join('|')).toContain(server.baseUrl);
  });
});

describe('dispose', () => {
  it('closes the pooled client', async () => {
    const client = makeClient(makeRawTools(['search']));
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);
    await warmedToolSet(service);

    service.dispose();

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
      expect(jest.getTimerCount()).toBe(2);

      service.dispose();
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
    await warmedToolSet(service);
    service.invalidateServer(server.id, { preserveSnapshot: true });
    expect(retainedFingerprints(service)).not.toEqual([]);

    service.dispose();

    expect(retainedFingerprints(service)).toEqual([]);
  });
});

/**
 * The fingerprint is private and deliberately absent from every public summary, but
 * "it does not hold the bearer token" is the property worth pinning, so read it back.
 */
function retainedFingerprints(service: McpRuntimeService): string[] {
  const internals = service as unknown as {
    runtimeSnapshots: Map<string, { transportFingerprint: string }>;
    runtimeStates: Map<string, { transportFingerprint: string }>;
  };

  return [...internals.runtimeStates.values(), ...internals.runtimeSnapshots.values()].map(
    (entry) => entry.transportFingerprint,
  );
}
