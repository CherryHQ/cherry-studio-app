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

    await resolver.resolve(AGENT_ID);

    expect(createRuntimeTools).toHaveBeenCalledWith([
      { descriptor: descriptor(SERVER_B, 'lookup'), approval: 'ask' },
    ]);
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

    await expect(resolver.resolve(AGENT_ID)).resolves.toEqual([]);
    expect(getMcpRuntime).not.toHaveBeenCalled();
  });
});
