import type { ToolSet } from 'ai';
import type { Assistant } from '@/data/types/assistant';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/data/types/assistant';
import type { McpServer } from '@/data/types/mcpServer';
import { McpService } from '../McpService';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockCreateMCPClient = jest.fn();
jest.mock('@ai-sdk/mcp', () => ({
  createMCPClient: (...args: unknown[]) => mockCreateMCPClient(...args),
}));

type FakeClient = {
  close: jest.Mock;
  tools: jest.Mock;
};

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
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
    timeout: null,
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
        execute: jest.fn(async () => ({ content: [{ text: `ok ${name}`, type: 'text' }] })),
        inputSchema: {},
        type: 'dynamic',
      },
    ]),
  ) as unknown as ToolSet;
}

function makeService(servers: McpServer[]) {
  const mcpServer = {
    list: jest.fn(async () => ({ items: servers, total: servers.length })),
  };
  const service = new McpService({ mcpServer: mcpServer as never });
  return { mcpServer, service };
}

beforeEach(() => {
  mockCreateMCPClient.mockReset();
});

describe('McpService.getToolSetForAssistant', () => {
  it('keys tools as mcp__server__tool and injects cherry metadata', async () => {
    const client: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['search'])),
    };
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    const tools = await service.getToolSetForAssistant(makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search']);
    expect(tools?.mcp__serverone__search.metadata).toEqual({
      cherry: { tool: { serverId: 'server-1', serverName: 'ServerOne', type: 'mcp' } },
    });
  });

  it('caches tools across calls (no reconnect)', async () => {
    const client: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['search'])),
    };
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    await service.getToolSetForAssistant(makeAssistant());
    await service.getToolSetForAssistant(makeAssistant());

    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(client.tools).toHaveBeenCalledTimes(1);
  });

  it('reconnects once when tools() fails (fail-and-drop)', async () => {
    const failing: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => {
        throw new Error('stale');
      }),
    };
    const healthy: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['search'])),
    };
    mockCreateMCPClient.mockResolvedValueOnce(failing).mockResolvedValueOnce(healthy);
    const { service } = makeService([makeServer()]);

    const tools = await service.getToolSetForAssistant(makeAssistant());

    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
    expect(failing.close).toHaveBeenCalled();
    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__search']);
  });

  it('skips unreachable servers without throwing', async () => {
    const good: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['ping'])),
    };
    // Servers connect in parallel (Promise.allSettled), so a call-order mock
    // (mockRejectedValueOnce) races non-deterministically — key on the URL.
    mockCreateMCPClient.mockImplementation(async (config: { transport: { url: string } }) => {
      if (config.transport.url.includes('down.example')) {
        throw new Error('server down');
      }
      return good;
    });
    const { service } = makeService([
      makeServer({ baseUrl: 'https://down.example/mcp', id: 'down', name: 'Down' }),
      makeServer({ baseUrl: 'https://up.example/mcp', id: 'up', name: 'Up' }),
    ]);

    const tools = await service.getToolSetForAssistant(makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__up__ping']);
  });

  it('filters disabled tools', async () => {
    const client: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['keep', 'drop'])),
    };
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer({ disabledTools: ['drop'] })]);

    const tools = await service.getToolSetForAssistant(makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__keep']);
  });

  it('honors wildcard and wire-id disabledTools entries (desktop rule parity)', async () => {
    const client: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['alpha', 'beta'])),
    };
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer({ disabledTools: ['mcp__serverone__*'] })]);

    expect(await service.getToolSetForAssistant(makeAssistant())).toBeUndefined();

    mockCreateMCPClient.mockClear();
    const wireId = makeService([makeServer({ disabledTools: ['mcp__serverone__alpha'] })]);
    const tools = await wireId.service.getToolSetForAssistant(makeAssistant());

    expect(Object.keys(tools ?? {})).toEqual(['mcp__serverone__beta']);
  });

  it('returns undefined when no active servers apply', async () => {
    const { service } = makeService([]);
    expect(await service.getToolSetForAssistant(makeAssistant())).toBeUndefined();
    expect(mockCreateMCPClient).not.toHaveBeenCalled();
  });
});

describe('wrapped tool execution', () => {
  it('throws with a text summary when the result isError', async () => {
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
    const client: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => rawTools),
    };
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    const tools = await service.getToolSetForAssistant(makeAssistant());
    const tool = tools?.mcp__serverone__boom;

    await expect(
      (tool?.execute as (args: unknown, opts: unknown) => Promise<unknown>)({}, {}),
    ).rejects.toThrow('kaboom');
  });

  it('compresses output to text for the model via toModelOutput', async () => {
    const client: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['search'])),
    };
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([makeServer()]);

    const tools = await service.getToolSetForAssistant(makeAssistant());
    const tool = tools?.mcp__serverone__search;
    const modelOutput = tool?.toModelOutput?.({
      input: {},
      output: { content: [{ text: 'summary', type: 'text' }] },
      toolCallId: 'call-1',
    });

    expect(modelOutput).toEqual({ type: 'text', value: 'summary' });
  });
});

describe('testConnection', () => {
  it('returns tool summaries and always closes the throwaway client', async () => {
    const client: FakeClient = {
      close: jest.fn(async () => undefined),
      tools: jest.fn(async () => makeRawTools(['a', 'b'])),
    };
    mockCreateMCPClient.mockResolvedValue(client);
    const { service } = makeService([]);

    const result = await service.testConnection({ baseUrl: 'https://x.example/mcp' });

    expect(result.tools.map((t) => t.name)).toEqual(['a', 'b']);
    expect(client.close).toHaveBeenCalled();
  });
});
