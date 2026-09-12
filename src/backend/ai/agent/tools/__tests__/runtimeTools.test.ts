import type { McpExecutableToolDescriptor, McpRuntimeToolSelection } from '@/backend/ai/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

import type { RuntimeTool } from '../../runtime';
import { createAgentRuntimeToolResolver } from '../runtimeTools';

const AGENT_ID = 'agent-1';
const SERVER_A = '00000000-0000-4000-8000-000000000001';
const SERVER_B = '00000000-0000-4000-8000-000000000002';

function remoteServer(id: string): McpServer {
  return {
    id,
    name: 'Remote tools',
    origin: 'remote',
    endpointUrl: `https://${id}.example/mcp`,
    isEnabled: true,
    disabledTools: [],
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  };
}

function pluginServer(id: string, isEnabled = true): Extract<McpServer, { origin: 'builtin' }> {
  return {
    ...remoteServer(id),
    name: 'GitHub',
    origin: 'builtin',
    builtinId: 'github',
    authorizationId: SERVER_B,
    endpointUrl: null,
    headers: undefined,
    isEnabled,
  };
}

const remoteServers = {
  list: async () => ({
    items: [
      remoteServer(SERVER_A),
      remoteServer(SERVER_B),
      remoteServer('00000000-0000-4000-8000-000000000005'),
    ],
  }),
};

function binding(
  serverId: string,
  overrides: Partial<Extract<AgentToolBinding, { source: 'mcp' }>> = {},
): Extract<AgentToolBinding, { source: 'mcp' }> {
  return {
    agentId: AGENT_ID,
    approval: 'ask',
    createdAt: '2026-08-26T00:00:00.000Z',
    displayNameSnapshot: null,
    enabled: true,
    id: '00000000-0000-4000-8000-000000000003',
    serverId,
    source: 'mcp',
    updatedAt: '2026-08-26T00:00:00.000Z',
    ...overrides,
  };
}

function descriptor(serverId: string, rawToolName: string): McpExecutableToolDescriptor {
  return {
    description: `${rawToolName} description`,
    displayName: rawToolName,
    endpointUrl: `https://${serverId}.example/mcp`,
    generation: 1,
    inputSchema: { type: 'object' },
    rawToolName,
    serverId,
  };
}

describe('Agent Runtime MCP tool resolution', () => {
  test('discovers only enabled allowed tools and applies effective per-tool policy', async () => {
    const listExecutableToolDescriptors = jest.fn(async (serverId: string) =>
      serverId === SERVER_A
        ? [descriptor(SERVER_A, 'search'), descriptor(SERVER_A, 'delete')]
        : [descriptor(SERVER_B, 'lookup')],
    );
    const createRuntimeTools = jest.fn(
      (selections: readonly McpRuntimeToolSelection[]) => selections as unknown as RuntimeTool[],
    );
    const resolveMcpTool = jest.fn(async (_agentId: string, input: { rawToolName: string }) =>
      input.rawToolName === 'delete'
        ? { approval: 'ask' as const, enabled: false }
        : input.rawToolName === 'lookup'
          ? { approval: 'deny' as const, enabled: true }
          : { approval: 'auto' as const, enabled: true },
    );
    const resolver = createAgentRuntimeToolResolver({
      servers: remoteServers,
      bindings: {
        list: async () => ({
          items: [
            binding(SERVER_A),
            binding(SERVER_B, { id: '00000000-0000-4000-8000-000000000004' }),
            binding('00000000-0000-4000-8000-000000000005', {
              enabled: false,
              id: '00000000-0000-4000-8000-000000000006',
            }),
          ],
        }),
        resolveMcpTool,
      },
      getMcpRuntime: () => ({ createRuntimeTools, listExecutableToolDescriptors }),
    });

    await resolver.resolve(AGENT_ID);

    expect(listExecutableToolDescriptors).toHaveBeenCalledTimes(2);
    expect(createRuntimeTools).toHaveBeenCalledWith([
      { descriptor: descriptor(SERVER_A, 'search'), approval: 'ask' },
    ]);
  });

  test('fails closed per unavailable catalog without mutating durable bindings', async () => {
    const createRuntimeTools = jest.fn(() => []);
    const onUnavailable = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      servers: remoteServers,
      bindings: {
        list: async () => ({ items: [binding(SERVER_A), binding(SERVER_B)] }),
        resolveMcpTool: async () => ({ approval: 'ask', enabled: true }),
      },
      getMcpRuntime: () => ({
        createRuntimeTools,
        listExecutableToolDescriptors: async (serverId) => {
          if (serverId === SERVER_A) throw new Error('private endpoint failed');
          return [descriptor(SERVER_B, 'lookup')];
        },
      }),
    });

    await resolver.resolve(AGENT_ID, onUnavailable);

    expect(createRuntimeTools).toHaveBeenCalledWith([
      { descriptor: descriptor(SERVER_B, 'lookup'), approval: 'ask' },
    ]);
    expect(onUnavailable).toHaveBeenCalledWith(expect.stringContaining('Remote tools'));
    expect(JSON.stringify(onUnavailable.mock.calls)).not.toContain('private endpoint');
  });

  test('skips discovery without connected plugins or enabled remote bindings', async () => {
    const getMcpRuntime = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      servers: remoteServers,
      bindings: {
        list: async () => ({ items: [binding(SERVER_A, { enabled: false })] }),
        resolveMcpTool: jest.fn(),
      },
      getMcpRuntime,
    });

    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual({ tools: [], pluginGuides: [] });
    expect(getMcpRuntime).not.toHaveBeenCalled();
  });

  test('all connected plugins are available across Agents and turns without message selection', async () => {
    const pluginDescriptors = [SERVER_A, SERVER_B].map((id) => ({
      ...descriptor(id, 'search'),
      endpointUrl: null,
    }));
    const onUnavailable = jest.fn();
    const createRuntimeTools = jest.fn(
      (selections: readonly McpRuntimeToolSelection[]) => selections as unknown as RuntimeTool[],
    );
    const resolveMcpTool = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      bindings: {
        list: async (agentId) => ({
          items:
            agentId === AGENT_ID ? [] : [binding(SERVER_A, { enabled: false, approval: 'deny' })],
        }),
        resolveMcpTool,
      },
      servers: {
        list: async () => ({
          items: [
            pluginServer(SERVER_A),
            { ...pluginServer(SERVER_B), builtinId: 'feishu', name: 'Feishu' },
          ],
        }),
      },
      getMcpRuntime: () => ({
        createRuntimeTools,
        listExecutableToolDescriptors: async (serverId, reportUnavailable) => {
          reportUnavailable?.('Some plugin tools are unavailable.');
          return pluginDescriptors.filter((tool) => tool.serverId === serverId);
        },
      }),
    });

    const expected = {
      tools: pluginDescriptors.map((descriptor) => ({ descriptor, approval: 'ask' })),
      pluginGuides: [],
    };
    await expect(resolver.resolve(AGENT_ID, onUnavailable)).resolves.toEqual(expected);
    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual(expected);
    await expect(resolver.resolve('another-agent')).resolves.toEqual(expected);
    expect(resolveMcpTool).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledWith('Some plugin tools are unavailable.');
  });

  test('ignores unbound remote servers, disabled plugins, and deleted bound servers', async () => {
    const missingId = '00000000-0000-4000-8000-000000000007';
    const getMcpRuntime = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      bindings: { list: async () => ({ items: [binding(missingId)] }), resolveMcpTool: jest.fn() },
      servers: {
        list: async () => ({ items: [remoteServer(SERVER_A), pluginServer(SERVER_B, false)] }),
      },
      getMcpRuntime,
    });
    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual({ tools: [], pluginGuides: [] });
    expect(getMcpRuntime).not.toHaveBeenCalled();
  });

  test('connected plugins coexist with remote MCP bindings and retain remote per-tool denials', async () => {
    const createRuntimeTools = jest.fn(
      (selections: readonly McpRuntimeToolSelection[]) => selections as unknown as RuntimeTool[],
    );
    const resolver = createAgentRuntimeToolResolver({
      bindings: {
        list: async () => ({ items: [binding(SERVER_B)] }),
        resolveMcpTool: async (_agentId, input) => ({
          approval: input.rawToolName === 'delete' ? 'deny' : 'ask',
          enabled: true,
        }),
      },
      servers: { list: async () => ({ items: [remoteServer(SERVER_B), pluginServer(SERVER_A)] }) },
      getMcpRuntime: () => ({
        createRuntimeTools,
        listExecutableToolDescriptors: async (id) =>
          id === SERVER_A
            ? [{ ...descriptor(id, 'search'), endpointUrl: null }]
            : [descriptor(id, 'lookup'), descriptor(id, 'delete')],
      }),
    });
    const { tools, pluginGuides } = await resolver.resolve(AGENT_ID);
    expect(pluginGuides).toEqual([]);
    expect(tools).toEqual([
      { descriptor: descriptor(SERVER_B, 'lookup'), approval: 'ask' },
      { descriptor: { ...descriptor(SERVER_A, 'search'), endpointUrl: null }, approval: 'ask' },
    ]);
  });

  test('refreshes plugin availability after disconnect and reconnect', async () => {
    let connected: McpServer[] = [pluginServer(SERVER_A)];
    const resolver = createAgentRuntimeToolResolver({
      bindings: { list: async () => ({ items: [] }), resolveMcpTool: jest.fn() },
      servers: { list: async () => ({ items: connected }) },
      getMcpRuntime: () => ({
        createRuntimeTools: (selections) => selections as unknown as RuntimeTool[],
        listExecutableToolDescriptors: async (id) => [
          { ...descriptor(id, 'search'), endpointUrl: null },
        ],
      }),
    });
    const { tools: first } = await resolver.resolve(AGENT_ID);
    expect(first).toHaveLength(1);
    connected = [];
    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual({ tools: [], pluginGuides: [] });
    connected = [pluginServer(SERVER_B)];
    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual({
      tools: [
        { descriptor: { ...descriptor(SERVER_B, 'search'), endpointUrl: null }, approval: 'ask' },
      ],
      pluginGuides: [],
    });
    expect(first).toEqual([
      { descriptor: { ...descriptor(SERVER_A, 'search'), endpointUrl: null }, approval: 'ask' },
    ]);
  });

  test('shares plugin guides across Agents and refreshes them from executable tools and the current connection', async () => {
    let canWrite = false;
    let isConnected = true;
    const resolver = createAgentRuntimeToolResolver({
      bindings: {
        list: async () => ({ items: [] }),
        resolveMcpTool: jest.fn(),
      },
      servers: {
        list: async () => ({
          items: [{ ...pluginServer(SERVER_A), builtinId: 'feishu', name: 'Feishu' }],
        }),
      },
      getMcpRuntime: () => ({
        createRuntimeTools: (selections) => selections as unknown as RuntimeTool[],
        listExecutableToolDescriptors: async () => {
          if (!isConnected) throw new Error('Disconnected');
          const names = canWrite ? ['fetch-doc', 'update-doc'] : ['fetch-doc'];
          return names.map((name) => ({
            ...descriptor(SERVER_A, name),
            endpointUrl: null,
            pluginId: 'feishu',
          }));
        },
      }),
    });

    const firstTurn = await resolver.resolve(AGENT_ID);
    expect(firstTurn.pluginGuides).toHaveLength(1);
    expect(firstTurn.pluginGuides[0].content).toContain('## Read a document');
    expect(firstTurn.pluginGuides[0].content).not.toContain('update-doc');
    await expect(resolver.resolve('another-agent')).resolves.toEqual(firstTurn);

    canWrite = true;
    const secondTurn = await resolver.resolve(AGENT_ID);
    expect(secondTurn.pluginGuides[0].content).toContain('## Modify an existing document');
    expect(firstTurn.pluginGuides[0].content).not.toContain('update-doc');

    isConnected = false;
    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual({ tools: [], pluginGuides: [] });
    expect(secondTurn.pluginGuides[0].content).toContain('## Modify an existing document');
  });

  test('keeps permitted Feishu business guides when hosted discovery fails', async () => {
    const warning = 'Feishu document tools and people lookup could not be loaded (timeout).';
    const onUnavailable = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      bindings: {
        list: async () => ({ items: [] }),
        resolveMcpTool: jest.fn(),
      },
      servers: {
        list: async () => ({
          items: [{ ...pluginServer(SERVER_A), builtinId: 'feishu', name: 'Feishu' }],
        }),
      },
      getMcpRuntime: () => ({
        createRuntimeTools: (selections) => selections as unknown as RuntimeTool[],
        listExecutableToolDescriptors: async (_serverId, report) => {
          report?.(warning);
          return [
            'wiki_get_node',
            'base_list_fields',
            'base_search_records',
            'task_list',
            'calendar_get_primary',
          ].map((name) => ({
            ...descriptor(SERVER_A, name),
            endpointUrl: null,
            pluginId: 'feishu',
          }));
        },
      }),
    });

    const { tools, pluginGuides } = await resolver.resolve(AGENT_ID, onUnavailable);
    expect(tools).toHaveLength(5);
    expect(onUnavailable.mock.calls).toEqual([[warning]]);
    expect(pluginGuides).toHaveLength(1);
    const content = pluginGuides[0].content;
    expect(content).toContain('## Query Base records');
    expect(content).toContain('## Resolve a wiki link');
    expect(content).not.toContain('## Update a Base record');
    expect(content).not.toContain('fetch-doc');
    expect(content).not.toContain('search-user');
  });
});
