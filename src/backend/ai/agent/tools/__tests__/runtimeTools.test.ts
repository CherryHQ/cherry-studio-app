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

function pluginServer(id: string, isEnabled = true): McpServer {
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

const remoteServers = { getById: async (id: string) => remoteServer(id) };

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

    await resolver.resolve(AGENT_ID, [], onUnavailable);

    expect(createRuntimeTools).toHaveBeenCalledWith([
      { descriptor: descriptor(SERVER_B, 'lookup'), approval: 'ask' },
    ]);
    expect(onUnavailable).toHaveBeenCalledWith(expect.stringContaining(SERVER_A));
    expect(JSON.stringify(onUnavailable.mock.calls)).not.toContain('private endpoint');
  });

  test('does not resolve MCP Runtime state when the Agent has no enabled MCP binding', async () => {
    const getMcpRuntime = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      servers: remoteServers,
      bindings: {
        list: async () => ({ items: [binding(SERVER_A, { enabled: false })] }),
        resolveMcpTool: jest.fn(),
      },
      getMcpRuntime,
    });

    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual([]);
    expect(getMcpRuntime).not.toHaveBeenCalled();
  });

  test('legacy Agent bindings cannot enable plugins without a message selection', async () => {
    const getMcpRuntime = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      bindings: {
        list: async () => ({ items: [binding(SERVER_A)] }),
        resolveMcpTool: jest.fn(),
      },
      servers: { getById: async (id) => pluginServer(id) },
      getMcpRuntime,
    });
    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual([]);
    expect(getMcpRuntime).not.toHaveBeenCalled();
  });

  test('explicit plugin selection needs no Agent binding and is limited to that message', async () => {
    const selectedDescriptor = { ...descriptor(SERVER_A, 'search'), endpointUrl: null };
    const onUnavailable = jest.fn();
    const createRuntimeTools = jest.fn(
      (selections: readonly McpRuntimeToolSelection[]) => selections as unknown as RuntimeTool[],
    );
    const resolveMcpTool = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      bindings: { list: async () => ({ items: [] }), resolveMcpTool },
      servers: { getById: async (id) => pluginServer(id) },
      getMcpRuntime: () => ({
        createRuntimeTools,
        listExecutableToolDescriptors: async (_serverId, reportUnavailable) => {
          reportUnavailable?.('Some plugin tools are unavailable.');
          return [selectedDescriptor];
        },
      }),
    });

    await expect(resolver.resolve(AGENT_ID, [SERVER_A, SERVER_A], onUnavailable)).resolves.toEqual([
      { descriptor: selectedDescriptor, approval: 'ask' },
    ]);
    expect(resolveMcpTool).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledWith('Some plugin tools are unavailable.');
    await expect(resolver.resolve(AGENT_ID, [], onUnavailable)).resolves.toEqual([]);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(createRuntimeTools).toHaveBeenCalledTimes(1);
  });

  test('plugin selections cannot enable remote, disabled, or disconnected servers', async () => {
    const missingId = '00000000-0000-4000-8000-000000000007';
    const getMcpRuntime = jest.fn();
    const resolver = createAgentRuntimeToolResolver({
      bindings: { list: async () => ({ items: [] }), resolveMcpTool: jest.fn() },
      servers: {
        getById: async (id) => {
          if (id === missingId) throw new Error('Connection deleted');
          return id === SERVER_A ? remoteServer(id) : pluginServer(id, false);
        },
      },
      getMcpRuntime,
    });
    await expect(resolver.resolve(AGENT_ID, [SERVER_A, SERVER_B, missingId])).resolves.toEqual([]);
    expect(getMcpRuntime).not.toHaveBeenCalled();
  });

  test('selected plugins coexist with remote MCP bindings and retain remote per-tool denials', async () => {
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
      servers: { getById: async (id) => (id === SERVER_A ? pluginServer(id) : remoteServer(id)) },
      getMcpRuntime: () => ({
        createRuntimeTools,
        listExecutableToolDescriptors: async (id) =>
          id === SERVER_A
            ? [{ ...descriptor(id, 'search'), endpointUrl: null }]
            : [descriptor(id, 'lookup'), descriptor(id, 'delete')],
      }),
    });
    const tools = await resolver.resolve(AGENT_ID, [SERVER_A, SERVER_B]);
    expect(tools).toEqual([
      { descriptor: descriptor(SERVER_B, 'lookup'), approval: 'ask' },
      { descriptor: { ...descriptor(SERVER_A, 'search'), endpointUrl: null }, approval: 'ask' },
    ]);
  });
});
