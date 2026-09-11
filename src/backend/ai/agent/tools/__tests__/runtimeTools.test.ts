import type { McpExecutableToolDescriptor, McpRuntimeToolSelection } from '@/backend/ai/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';

import type { RuntimeTool } from '../../runtime';
import { createAgentRuntimeToolResolver } from '../runtimeTools';

const AGENT_ID = 'agent-1';
const SERVER_A = '00000000-0000-4000-8000-000000000001';
const SERVER_B = '00000000-0000-4000-8000-000000000002';

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
    expect(onUnavailable).toHaveBeenCalledWith(expect.stringContaining(SERVER_A));
    expect(JSON.stringify(onUnavailable.mock.calls)).not.toContain('private endpoint');
  });

  test('does not resolve MCP Runtime state when the Agent has no enabled MCP binding', async () => {
    const getMcpRuntime = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      bindings: {
        list: async () => ({ items: [binding(SERVER_A, { enabled: false })] }),
        resolveMcpTool: jest.fn(),
      },
      getMcpRuntime,
    });

    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual({ tools: [], pluginGuides: [] });
    expect(getMcpRuntime).not.toHaveBeenCalled();
  });

  test('keeps guides isolated by Agent, effective tool policy and the current connection snapshot', async () => {
    let canWrite = false;
    let isConnected = true;
    const resolver = createAgentRuntimeToolResolver({
      bindings: {
        list: async (agentId) => ({ items: agentId === AGENT_ID ? [binding(SERVER_A)] : [] }),
        resolveMcpTool: async (_agentId, { rawToolName }) => ({
          enabled: true,
          approval: rawToolName === 'update-doc' && !canWrite ? 'deny' : 'ask',
        }),
      },
      getMcpRuntime: () => ({
        createRuntimeTools: (selections) => selections as unknown as RuntimeTool[],
        listExecutableToolDescriptors: async () => {
          if (!isConnected) throw new Error('Disconnected');
          return ['fetch-doc', 'update-doc'].map((name) => ({
            ...descriptor(SERVER_A, name),
            pluginId: 'feishu',
          }));
        },
      }),
    });

    const firstTurn = await resolver.resolve(AGENT_ID);
    expect(firstTurn.pluginGuides).toHaveLength(1);
    expect(firstTurn.pluginGuides[0].content).toContain('## Read a document');
    expect(firstTurn.pluginGuides[0].content).not.toContain('update-doc');
    await expect(resolver.resolve('another-agent')).resolves.toEqual({
      tools: [],
      pluginGuides: [],
    });

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
        list: async () => ({ items: [binding(SERVER_A)] }),
        resolveMcpTool: async (_agentId, { rawToolName }) => ({
          enabled: true,
          approval: rawToolName === 'base_update_record' ? 'deny' : 'ask',
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
            'base_update_record',
            'task_list',
            'calendar_get_primary',
          ].map((name) => ({ ...descriptor(SERVER_A, name), pluginId: 'feishu' }));
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
