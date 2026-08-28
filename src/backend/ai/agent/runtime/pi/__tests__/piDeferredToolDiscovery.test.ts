import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../../types';
import {
  createPiDeferredToolDiscoveryTools,
  PI_TOOL_CALL_TOOL_NAME,
  PI_TOOL_DESCRIBE_TOOL_NAME,
  PI_TOOL_SEARCH_TOOL_NAME,
} from '../piDeferredToolDiscovery';

const SIGNAL = new AbortController().signal;

function mcpTool(
  providerName: string,
  description: string,
  inputSchema: RuntimeJsonValue = {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
): RuntimeTool {
  return {
    ref: { source: 'mcp', serverId: 'server-1', rawToolName: providerName },
    providerName,
    displayName: providerName,
    description,
    inputSchema,
    approval: 'ask',
    execute: async () => ({ value: { ok: true }, artifacts: [] }),
  };
}

function execute(tool: RuntimeTool, input: RuntimeJsonValue, toolCallId = 'call-1') {
  return tool.execute({ input, signal: SIGNAL, toolCallId });
}

describe('createPiDeferredToolDiscoveryTools', () => {
  test('searches names and descriptions and returns TypeScript call signatures', async () => {
    const searchIssues = mcpTool('mcp_server_1_search_issues', 'Find repository issues');
    const listFiles = mcpTool('mcp_server_1_list_files', 'List files');
    const tools = createPiDeferredToolDiscoveryTools([searchIssues, listFiles], async () => ({
      value: null,
      artifacts: [],
    }));
    const search = tools.find((tool) => tool.providerName === PI_TOOL_SEARCH_TOOL_NAME);
    if (!search) throw new Error('Missing tool_search.');

    const result = await execute(search, { query: 'repository' });
    const serialized = JSON.stringify(result.value);

    expect(serialized).toContain('mcp_server_1_search_issues');
    expect(serialized).toContain('declare function tool_call');
    expect(serialized).toContain('params: { query: string }');
    expect(serialized).not.toContain('mcp_server_1_list_files');
  });

  test('matches camel-case abbreviations in MCP tool names', async () => {
    const search = createPiDeferredToolDiscoveryTools(
      [mcpTool('mcp_server_1_getHTTPResponse', '')],
      async () => ({ value: null, artifacts: [] }),
    ).find((tool) => tool.providerName === PI_TOOL_SEARCH_TOOL_NAME);
    if (!search) throw new Error('Missing tool_search.');

    const result = await execute(search, { query: 'http response' });

    expect(JSON.stringify(result.value)).toContain('mcp_server_1_getHTTPResponse');
  });

  test('describes and delegates an exact discovered tool', async () => {
    const target = mcpTool('mcp_server_1_search_issues', 'Find repository issues');
    const targetResult: RuntimeToolResult = { value: { total: 1 }, artifacts: [] };
    const invokeTarget = jest.fn(async () => targetResult);
    const tools = createPiDeferredToolDiscoveryTools([target], invokeTarget);
    const describeTool = tools.find((tool) => tool.providerName === PI_TOOL_DESCRIBE_TOOL_NAME);
    const callTool = tools.find((tool) => tool.providerName === PI_TOOL_CALL_TOOL_NAME);
    if (!describeTool || !callTool) throw new Error('Missing deferred-discovery tools.');

    const description = await execute(describeTool, { name: target.providerName }, 'describe-1');
    const catalogCallInput: RuntimeJsonValue = {
      name: target.providerName,
      params: { query: 'bug' },
    };
    const result = await execute(callTool, catalogCallInput, 'catalog-call-1');
    const described = description.value as { declaration: string };

    expect(JSON.stringify(description.value)).toContain('Find repository issues');
    expect(described.declaration).toContain(`name: "${target.providerName}"`);
    expect(result).toEqual(targetResult);
    expect(invokeTarget).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        input: { query: 'bug' },
        toolCallId: 'catalog-call-1',
      }),
      catalogCallInput,
    );
  });

  test('limits an unfiltered catalog browse to twenty tools', async () => {
    const catalog = Array.from({ length: 25 }, (_, index) =>
      mcpTool(`mcp_server_1_tool_${String(index).padStart(2, '0')}`, `Tool ${index}`),
    );
    const search = createPiDeferredToolDiscoveryTools(catalog, async () => ({
      value: null,
      artifacts: [],
    })).find((tool) => tool.providerName === PI_TOOL_SEARCH_TOOL_NAME);
    if (!search) throw new Error('Missing tool_search.');

    const result = await execute(search, {});
    const value = result.value as {
      matchedNamespaces: { tools: unknown[] }[];
    };

    expect(value.matchedNamespaces[0]?.tools).toHaveLength(20);
  });
});
