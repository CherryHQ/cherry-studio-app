import type { AgentTool as PiAgentTool } from '@earendil-works/pi-agent-core';

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

async function runMetaTool(
  _toolCallId: string,
  _signal: AbortSignal | undefined,
  _activity: unknown,
  operation: (modelOutputCharacterLimit: number) => {
    activityOutput: RuntimeToolResult;
    modelOutput: RuntimeToolResult;
  },
) {
  return operation(Number.MAX_SAFE_INTEGER).modelOutput;
}

function runMetaToolWithLimit(modelOutputCharacterLimit: number) {
  return async (
    _toolCallId: string,
    _signal: AbortSignal | undefined,
    _activity: unknown,
    operation: (limit: number) => {
      activityOutput: RuntimeToolResult;
      modelOutput: RuntimeToolResult;
    },
  ) => operation(modelOutputCharacterLimit).modelOutput;
}

function execute(tool: PiAgentTool, input: RuntimeJsonValue, toolCallId = 'call-1') {
  return tool.execute(toolCallId, input as never, SIGNAL);
}

describe('createPiDeferredToolDiscoveryTools', () => {
  test('searches names and descriptions and returns TypeScript call signatures', async () => {
    const searchIssues = mcpTool('mcp_server_1_search_issues', 'Find repository issues');
    const listFiles = mcpTool('mcp_server_1_list_files', 'List files');
    const tools = createPiDeferredToolDiscoveryTools(
      [searchIssues, listFiles],
      async () => ({
        value: null,
        artifacts: [],
      }),
      runMetaTool,
    );
    const search = tools.find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    if (!search) throw new Error('Missing tool_search.');

    const result = (await execute(search, { query: 'repository' })).details as RuntimeToolResult;
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
      runMetaTool,
    ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    if (!search) throw new Error('Missing tool_search.');

    const result = (await execute(search, { query: 'http response' })).details as RuntimeToolResult;

    expect(JSON.stringify(result.value)).toContain('mcp_server_1_getHTTPResponse');
  });

  test('describes and delegates an exact discovered tool', async () => {
    const target = mcpTool('mcp_server_1_search_issues', 'Find repository issues');
    const targetResult: RuntimeToolResult = { value: { total: 1 }, artifacts: [] };
    const invokeTarget = jest.fn(async () => targetResult);
    const tools = createPiDeferredToolDiscoveryTools([target], invokeTarget, runMetaTool);
    const describeTool = tools.find((tool) => tool.name === PI_TOOL_DESCRIBE_TOOL_NAME);
    const callTool = tools.find((tool) => tool.name === PI_TOOL_CALL_TOOL_NAME);
    if (!describeTool || !callTool) throw new Error('Missing deferred-discovery tools.');

    const description = (await execute(describeTool, { name: target.providerName }, 'describe-1'))
      .details as RuntimeToolResult;
    const catalogCallInput: RuntimeJsonValue = {
      name: target.providerName,
      params: { query: 'bug' },
    };
    const result = (await execute(callTool, catalogCallInput, 'catalog-call-1'))
      .details as RuntimeToolResult;
    const described = description.value as { declaration: string };

    expect(JSON.stringify(description.value)).toContain('Find repository issues');
    expect(described.declaration).toContain(`name: "${target.providerName}"`);
    expect(result).toEqual(targetResult);
    expect(invokeTarget).toHaveBeenCalledWith(target, { query: 'bug' }, 'catalog-call-1', SIGNAL);
  });

  test('returns an unseen tool signature before dispatch and accepts the corrected retry', async () => {
    const target = mcpTool('mcp_server_1_search_issues', 'Find repository issues');
    const targetResult: RuntimeToolResult = { value: { total: 1 }, artifacts: [] };
    const invokeTarget = jest.fn(async () => targetResult);
    const callTool = createPiDeferredToolDiscoveryTools([target], invokeTarget, runMetaTool).find(
      (tool) => tool.name === PI_TOOL_CALL_TOOL_NAME,
    );
    if (!callTool) throw new Error('Missing tool_call.');

    const catalogCallInput: RuntimeJsonValue = {
      name: target.providerName,
      params: { query: 'bug' },
    };
    await expect(execute(callTool, catalogCallInput, 'uninspected-call')).rejects.toMatchObject({
      code: 'tool_schema_not_inspected',
      message: expect.stringContaining(`name: "${target.providerName}"`),
      retryable: false,
    });
    expect(invokeTarget).not.toHaveBeenCalled();

    const result = (await execute(callTool, catalogCallInput, 'corrected-call'))
      .details as RuntimeToolResult;

    expect(result).toEqual(targetResult);
    expect(invokeTarget).toHaveBeenCalledWith(target, { query: 'bug' }, 'corrected-call', SIGNAL);
  });

  test('returns the inspected signature when params do not match the tool schema', async () => {
    const target = mcpTool('mcp_server_1_search_issues', 'Find repository issues');
    const invokeTarget = jest.fn(async () => ({ value: { total: 1 }, artifacts: [] }));
    const tools = createPiDeferredToolDiscoveryTools([target], invokeTarget, runMetaTool);
    const searchTool = tools.find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    const callTool = tools.find((tool) => tool.name === PI_TOOL_CALL_TOOL_NAME);
    if (!searchTool || !callTool) throw new Error('Missing deferred-discovery tools.');

    await execute(searchTool, { query: 'repository' }, 'search-1');
    await expect(
      execute(
        callTool,
        { name: target.providerName, params: { wrongParameter: true } },
        'invalid-call',
      ),
    ).rejects.toMatchObject({
      code: 'tool_input_invalid',
      message: expect.stringContaining('params: { query: string }'),
      retryable: false,
    });
    expect(invokeTarget).not.toHaveBeenCalled();
  });

  test('dispatches a tool whose schema Zod cannot convert instead of rejecting it forever', async () => {
    // Draft-07 `#/definitions` refs are what most MCP servers publish, and
    // z.fromJSONSchema throws on them. Without a validator the call has to go
    // through, or the corrected retry returns the same signature until the turn
    // runs out of tool calls.
    const target = mcpTool('mcp_server_1_search_issues', 'Find repository issues', {
      type: 'object',
      properties: { query: { $ref: '#/definitions/Query' } },
      required: ['query'],
      definitions: { Query: { type: 'string' } },
    });
    const targetResult: RuntimeToolResult = { value: { total: 1 }, artifacts: [] };
    const invokeTarget = jest.fn(async () => targetResult);
    const tools = createPiDeferredToolDiscoveryTools([target], invokeTarget, runMetaTool);
    const searchTool = tools.find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    const callTool = tools.find((tool) => tool.name === PI_TOOL_CALL_TOOL_NAME);
    if (!searchTool || !callTool) throw new Error('Missing deferred-discovery tools.');

    await execute(searchTool, { query: 'repository' }, 'search-1');
    const result = (
      await execute(callTool, { name: target.providerName, params: { query: 'bug' } }, 'call-1')
    ).details as RuntimeToolResult;

    expect(result).toEqual(targetResult);
    expect(invokeTarget).toHaveBeenCalledWith(target, { query: 'bug' }, 'call-1', SIGNAL);
  });

  test('dispatches a tool whose schema the catalog omitted instead of validating it unseen', async () => {
    const target = mcpTool('mcp_server_1_search_issues', 'Find repository issues', {
      type: 'object',
      properties: {
        query: { type: 'string' },
        ...Object.fromEntries(
          Array.from({ length: 2_000 }, (_, index) => [
            `parameter_${index}`,
            { type: 'string', description: 'A documented parameter.' },
          ]),
        ),
      },
      required: ['query'],
    });
    const targetResult: RuntimeToolResult = { value: { total: 1 }, artifacts: [] };
    const invokeTarget = jest.fn(async () => targetResult);
    const tools = createPiDeferredToolDiscoveryTools([target], invokeTarget, runMetaTool);
    const searchTool = tools.find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    const callTool = tools.find((tool) => tool.name === PI_TOOL_CALL_TOOL_NAME);
    if (!searchTool || !callTool) throw new Error('Missing deferred-discovery tools.');

    const search = (await execute(searchTool, { query: 'repository' }, 'search-1'))
      .details as RuntimeToolResult;
    expect(JSON.stringify(search.value)).toContain('params: Record<string, unknown>');

    const result = (
      await execute(callTool, { name: target.providerName, params: { guessed: 'bug' } }, 'call-1')
    ).details as RuntimeToolResult;

    expect(result).toEqual(targetResult);
    expect(invokeTarget).toHaveBeenCalledWith(target, { guessed: 'bug' }, 'call-1', SIGNAL);
  });

  test('limits an unfiltered catalog browse to twenty tools', async () => {
    const catalog = Array.from({ length: 25 }, (_, index) =>
      mcpTool(`mcp_server_1_tool_${String(index).padStart(2, '0')}`, `Tool ${index}`),
    );
    const search = createPiDeferredToolDiscoveryTools(
      catalog,
      async () => ({
        value: null,
        artifacts: [],
      }),
      runMetaTool,
    ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    if (!search) throw new Error('Missing tool_search.');

    const result = (await execute(search, {})).details as RuntimeToolResult;
    const value = result.value as {
      matchedNamespaces: { tools: unknown[] }[];
    };

    expect(value.matchedNamespaces[0]?.tools).toHaveLength(20);
  });

  test('bounds oversized declarations with a valid generic signature', async () => {
    const properties = Object.fromEntries(
      Array.from({ length: 2_000 }, (_, index) => [
        `field_${index}`,
        { type: 'string', description: `Field ${index}` },
      ]),
    );
    const tools = createPiDeferredToolDiscoveryTools(
      [mcpTool('mcp_server_1_large_tool', 'Large tool', { type: 'object', properties })],
      async () => ({ value: null, artifacts: [] }),
      runMetaTool,
    );
    const search = tools.find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    const describe = tools.find((tool) => tool.name === PI_TOOL_DESCRIBE_TOOL_NAME);
    if (!search || !describe) throw new Error('Missing deferred-discovery tools.');

    const searchResult = (await execute(search, { query: 'large' })).details as RuntimeToolResult;
    const describeResult = (await execute(describe, { name: 'mcp_server_1_large_tool' }))
      .details as RuntimeToolResult;

    expect(JSON.stringify(searchResult).length).toBeLessThanOrEqual(32_000);
    expect(JSON.stringify(searchResult)).toContain('params: Record<string, unknown>');
    expect(JSON.stringify(describeResult)).toContain('params: Record<string, unknown>');
  });

  test('fits the complete search envelope within the live model-output budget', async () => {
    const modelOutputCharacterLimit = 2_500;
    const catalog = Array.from({ length: 20 }, (_, index) =>
      mcpTool(
        `mcp_server_1_tool_${String(index).padStart(2, '0')}`,
        `Tool ${index} ${'description '.repeat(100)}`,
      ),
    );
    const search = createPiDeferredToolDiscoveryTools(
      catalog,
      async () => ({ value: null, artifacts: [] }),
      runMetaToolWithLimit(modelOutputCharacterLimit),
    ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
    if (!search) throw new Error('Missing tool_search.');

    const result = (await execute(search, {})).details as RuntimeToolResult;

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(modelOutputCharacterLimit);
    expect(result.value).toMatchObject({ truncated: true });
  });
});
