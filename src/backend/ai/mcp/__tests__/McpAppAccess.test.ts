import type { ListToolsResult } from '@ai-sdk/mcp';

import type { McpAppReference } from '@/shared/contracts/mcpApp';
import type { RemoteMcpServer } from '@/shared/data/types/mcpServer';

import { McpAppAccess, type McpAppConnection } from '../McpAppAccess';
import { McpRuntimeToolError } from '../mcpRuntimeAdapter';

jest.mock('../mcpToolCatalogStore', () => ({ createMcpConnectionKey: async () => 'connection' }));

function fixture() {
  const reference: McpAppReference = {
    agentId: 'agent',
    serverId: 'server',
    toolName: 'widget',
    resourceUri: 'ui://widget',
    connectionKey: 'connection',
  };
  const tools: ListToolsResult['tools'] = [
    {
      name: 'widget',
      inputSchema: { type: 'object' },
      _meta: { ui: { resourceUri: 'ui://widget' } },
    },
    {
      name: 'write',
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
      },
    },
  ];
  const connection: McpAppConnection = {
    client: {} as McpAppConnection['client'],
    server: {
      id: 'server',
      name: 'Server',
      endpointUrl: 'https://example.com/mcp',
      isEnabled: true,
      disabledTools: [],
      createdAt: '',
      updatedAt: '',
    } satisfies RemoteMcpServer,
    signal: new AbortController().signal,
    tools: jest.fn(async () => tools),
    invoke: jest.fn(async (_name, _args, progress) => {
      progress.sent();
      return { content: [] };
    }),
  };
  const assertBinding = jest.fn(async () => {});
  const requestConsent = jest.fn(async () => ({ action: 'accept' as const }));
  const access = new McpAppAccess({
    isForeground: () => true,
    assertBinding,
    requestConsent,
    withConnection: async (_serverId, signal, operation) => operation({ ...connection, signal }),
  });
  const call = () =>
    access.call(reference, 'write', { title: 'Title' }, new AbortController().signal);
  return { access, reference, connection, assertBinding, requestConsent, call };
}

describe('MCP App authorization and invocation', () => {
  it('shares source and target validation within each of two fresh catalog rounds', async () => {
    const state = fixture();
    await expect(state.call()).resolves.toEqual({ content: [] });
    expect(state.connection.tools).toHaveBeenCalledTimes(2);
    expect(state.requestConsent).toHaveBeenCalledTimes(1);
    expect(state.connection.invoke).toHaveBeenCalledTimes(1);
  });

  it('does not invoke when permission changes while consent is pending', async () => {
    const state = fixture();
    state.requestConsent.mockImplementation(async () => {
      state.assertBinding.mockRejectedValue(
        new McpRuntimeToolError('mcp_tool_unavailable', 'Unavailable', false),
      );
      return { action: 'accept' };
    });
    await expect(state.call()).rejects.toMatchObject({ code: 'mcp_tool_unavailable' });
    expect(state.connection.invoke).not.toHaveBeenCalled();
  });

  it('rechecks target visibility after consent', async () => {
    const state = fixture();
    state.requestConsent.mockImplementation(async () => {
      state.connection.server.disabledTools.push('write');
      return { action: 'accept' };
    });
    await expect(state.call()).rejects.toMatchObject({ code: 'mcp_tool_unavailable' });
    expect(state.connection.invoke).not.toHaveBeenCalled();
  });

  it.each(['transport', 'oversized', 'invalidated'] as const)(
    'preserves an uncertain %s result after transmission without replay',
    async (failure) => {
      const state = fixture();
      jest.mocked(state.connection.invoke).mockImplementation(async (_name, _args, progress) => {
        progress.sent();
        if (failure === 'transport') throw new Error('private transport diagnostics');
        if (failure === 'invalidated') {
          state.assertBinding.mockRejectedValue(
            new McpRuntimeToolError('mcp_tool_unavailable', 'Unavailable', false),
          );
          return { content: [] };
        }
        return { content: [{ type: 'text', text: 'x'.repeat(4 * 1024 * 1024) }] };
      });
      await expect(state.call()).rejects.toMatchObject({
        code: 'mcp_tool_outcome_unknown',
        retryable: false,
      });
      expect(state.connection.invoke).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves a definitive server authorization refusal after dispatch', async () => {
    const state = fixture();
    const refusal = new McpRuntimeToolError('mcp_tool_unavailable', 'Authorization expired', false);
    jest.mocked(state.connection.invoke).mockImplementation(async (_name, _args, progress) => {
      progress.sent();
      throw refusal;
    });
    await expect(state.call()).rejects.toBe(refusal);
    expect(state.connection.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps a sent call uncertain when local waiting is cancelled', async () => {
    const state = fixture();
    const controller = new AbortController();
    jest.mocked(state.connection.invoke).mockImplementation(async (_name, _args, progress) => {
      progress.sent();
      controller.abort();
      return new Promise(() => {});
    });
    await expect(
      state.access.call(state.reference, 'write', { title: 'Title' }, controller.signal),
    ).rejects.toMatchObject({ code: 'mcp_tool_outcome_unknown', retryable: false });
    expect(state.connection.invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid arguments before requesting consent or sending a call', async () => {
    const state = fixture();
    await expect(
      state.access.call(state.reference, 'write', {}, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'mcp_tool_unavailable' });
    expect(state.requestConsent).not.toHaveBeenCalled();
    expect(state.connection.invoke).not.toHaveBeenCalled();
  });
});
