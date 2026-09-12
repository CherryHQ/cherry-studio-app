import type { AgentTool as PiAgentTool } from '@earendil-works/pi-agent-core';

import {
  getBuiltInPluginCatalog,
  requirePluginDefinition,
} from '@/backend/services/builtInMcp/pluginRegistry';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../../types';
import {
  createPiDeferredToolDiscoveryTools,
  PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT,
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

function searchNames(result: RuntimeToolResult): string[] {
  const value = result.value as { matchedNamespaces?: { tools: { name: string }[] }[] };
  return (value.matchedNamespaces ?? []).flatMap((group) => group.tools.map((tool) => tool.name));
}

function execute(tool: PiAgentTool, input: RuntimeJsonValue, toolCallId = 'call-1') {
  return tool.execute(toolCallId, input as never, SIGNAL);
}

describe('createPiDeferredToolDiscoveryTools', () => {
  test.each(['飞书日历', '日历', '飞书calendar'])(
    'finds the Feishu calendar with a continuous Chinese or mixed query: %s',
    async (query) => {
      const search = createPiDeferredToolDiscoveryTools(
        [
          mcpTool(
            'mcp_calendar_get_primary_1',
            '飞书 (feishu): 飞书日历、日程。Get the primary calendar.',
          ),
          mcpTool('mcp_search_repositories_1', 'GitHub (github): Search repositories.'),
        ],
        async () => ({ value: null, artifacts: [] }),
        runMetaTool,
      ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME)!;
      const result = (await execute(search, { query })).details as RuntimeToolResult;
      expect(JSON.stringify(result.value)).toContain('mcp_calendar_get_primary_1');
      expect(JSON.stringify(result.value)).not.toContain('mcp_search_repositories_1');
    },
  );
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

  test.each(['github', 'GitHub', 'GITHUB', 'git hub'])(
    'finds GitHub tools with the query "%s"',
    async (query) => {
      const search = createPiDeferredToolDiscoveryTools(
        [
          mcpTool('mcp_search_repositories_1f31g3w', 'Search GitHub repositories.'),
          mcpTool('mcp_weather_1234567', 'Get current weather.'),
        ],
        async () => ({ value: null, artifacts: [] }),
        runMetaTool,
      ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
      if (!search) throw new Error('Missing tool_search.');

      const result = (await execute(search, { query })).details as RuntimeToolResult;

      expect(JSON.stringify(result.value)).toContain('mcp_search_repositories_1f31g3w');
      expect(JSON.stringify(result.value)).not.toContain('mcp_weather_1234567');
    },
  );

  test.each(['amap', 'Amap', '高德地图'])(
    'finds tools by the platform identity in their catalog description: %s',
    async (query) => {
      const search = createPiDeferredToolDiscoveryTools(
        [
          mcpTool('mcp_weather_1234567', '高德地图 (amap): Get current weather.'),
          mcpTool('mcp_get_me_1234567', 'GitHub (github): Get the authenticated account.'),
        ],
        async () => ({ value: null, artifacts: [] }),
        runMetaTool,
      ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME);
      if (!search) throw new Error('Missing tool_search.');

      const result = (await execute(search, { query })).details as RuntimeToolResult;

      expect(JSON.stringify(result.value)).toContain('mcp_weather_1234567');
      expect(JSON.stringify(result.value)).not.toContain('mcp_get_me_1234567');
    },
  );

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
    await expect(execute(callTool, catalogCallInput, 'uninspected-call')).resolves.toMatchObject({
      details: {
        value: {
          status: 'error',
          error: {
            code: 'tool_schema_not_inspected',
            message: expect.stringContaining(`name: "${target.providerName}"`),
            retryable: false,
          },
        },
      },
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
    const result = (
      await execute(
        callTool,
        { name: target.providerName, params: { wrongParameter: true } },
        'invalid-call',
      )
    ).details as RuntimeToolResult;
    expect(result.value).toMatchObject({
      status: 'error',
      error: {
        code: 'tool_input_invalid',
        message: expect.stringContaining('params.query: Invalid input: expected string'),
        retryable: false,
      },
    });
    expect(JSON.stringify(result.value)).toContain('params: { query: string }');
    expect(invokeTarget).not.toHaveBeenCalled();
  });

  test.each([{ params: null }, { params: [] }, { params: 'not-an-object' }])(
    'rejects non-object params without silently replacing them with an empty object: $params',
    async ({ params }) => {
      const target = mcpTool('mcp_get_me', 'Get the account', { type: 'object' });
      const invokeTarget = jest.fn(async () => ({ value: null, artifacts: [] }));
      const tools = createPiDeferredToolDiscoveryTools([target], invokeTarget, runMetaTool);
      const describe = tools.find((tool) => tool.name === PI_TOOL_DESCRIBE_TOOL_NAME)!;
      const call = tools.find((tool) => tool.name === PI_TOOL_CALL_TOOL_NAME)!;
      await execute(describe, { name: target.providerName });

      const result = (await execute(call, { name: target.providerName, params }))
        .details as RuntimeToolResult;

      expect(result.value).toMatchObject({
        status: 'error',
        error: {
          code: 'tool_input_invalid',
          message: expect.stringContaining('params: Expected an object.'),
        },
      });
      expect(invokeTarget).not.toHaveBeenCalled();
    },
  );

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
    expect(result.value).toMatchObject({
      catalogTotal: 25,
      matched: 25,
      returned: 20,
      truncated: true,
    });
  });

  test('keeps only the tier that matches the most query terms', async () => {
    const search = createPiDeferredToolDiscoveryTools(
      [
        mcpTool('mcp_calendar_list_1', '云桥 (cloudbridge): 云桥日历、日程。List calendars.'),
        mcpTool('mcp_task_list_1', '云桥 (cloudbridge): 云桥任务、待办。List tasks.'),
        mcpTool('mcp_fetch_doc_1', '云桥 (cloudbridge): 查看云文档。Read a document by link.'),
        mcpTool('mcp_list_issues_1', 'Forge (forge): List repository issues.'),
      ],
      async () => ({ value: null, artifacts: [] }),
      runMetaTool,
    ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME)!;

    const narrowed = (await execute(search, { query: '云桥 日历' })).details as RuntimeToolResult;
    expect(searchNames(narrowed)).toEqual(['mcp_calendar_list_1']);

    const service = (await execute(search, { query: '云桥' })).details as RuntimeToolResult;
    expect(searchNames(service).sort()).toEqual([
      'mcp_calendar_list_1',
      'mcp_fetch_doc_1',
      'mcp_task_list_1',
    ]);
    expect(service.value).toMatchObject({ catalogTotal: 4, matched: 3, returned: 3 });
  });

  test('reports catalog coverage and query words that matched nothing', async () => {
    const search = createPiDeferredToolDiscoveryTools(
      [
        mcpTool('mcp_calendar_list_1', '云桥 (cloudbridge): 云桥日历、日程。List calendars.'),
        mcpTool('mcp_task_list_1', '云桥 (cloudbridge): 云桥任务、待办。List tasks.'),
      ],
      async () => ({ value: null, artifacts: [] }),
      runMetaTool,
    ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME)!;

    const browse = (await execute(search, {})).details as RuntimeToolResult;
    expect(browse.value).toMatchObject({ catalogTotal: 2, matched: 2, returned: 2 });
    expect(browse.value).not.toHaveProperty('unmatchedTerms');
    expect(browse.value).not.toHaveProperty('truncated');
    expect(Object.keys(browse.value as object).slice(0, 3)).toEqual([
      'catalogTotal',
      'matched',
      'returned',
    ]);

    const missing = (await execute(search, { query: '云桥 消息' })).details as RuntimeToolResult;
    expect(searchNames(missing)).toHaveLength(2);
    expect(missing.value).toMatchObject({ matched: 2, returned: 2, unmatchedTerms: ['消息'] });
  });

  test('every registered plugin service name is a discriminative search key', async () => {
    const plugins = getBuiltInPluginCatalog().map((entry) => requirePluginDefinition(entry.id));
    // Hosted descriptions are discovered remotely. This fixture protects the
    // common service prefix using registered names, without inventing their text.
    const toolsByPlugin = new Map(
      plugins.map((plugin, pluginIndex) => [
        plugin,
        Object.keys(plugin.tools).map((toolName, toolIndex) =>
          mcpTool(
            `mcp_${pluginIndex}_${toolIndex}`,
            `${plugin.serverName} (${plugin.catalog.id}): ${toolName}`,
          ),
        ),
      ]),
    );
    const search = createPiDeferredToolDiscoveryTools(
      [...toolsByPlugin.values()].flat(),
      async () => ({ value: null, artifacts: [] }),
      runMetaToolWithLimit(Number.MAX_SAFE_INTEGER),
    ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME)!;

    expect(plugins.length).toBeGreaterThan(1);
    for (const [plugin, tools] of toolsByPlugin) {
      const expected = tools.map((tool) => tool.providerName).sort();
      for (const query of [plugin.serverName, plugin.catalog.id]) {
        const result = (await execute(search, { query })).details as RuntimeToolResult;
        const names = searchNames(result);
        expect(result.value).toMatchObject({
          catalogTotal: [...toolsByPlugin.values()].flat().length,
          matched: expected.length,
          returned: names.length,
        });
        expect(names.length).toBeGreaterThan(0);
        expect(names.length).toBeLessThanOrEqual(20);
        expect(expected).toEqual(expect.arrayContaining(names));
        if (names.length < expected.length) {
          expect(result.value).toHaveProperty('truncated', true);
        } else {
          expect(names.sort()).toEqual(expected);
          expect(result.value).not.toHaveProperty('truncated');
        }
      }
    }
  });

  test('repeated query words cannot outweigh a more specific match', async () => {
    const search = createPiDeferredToolDiscoveryTools(
      [mcpTool('mcp_1', 'Cloudbridge: calendars tasks'), mcpTool('mcp_2', 'Cloudbridge: messages')],
      async () => ({ value: null, artifacts: [] }),
      runMetaTool,
    ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME)!;

    const result = (await execute(search, { query: 'messages messages messages calendars tasks' }))
      .details as RuntimeToolResult;

    expect(searchNames(result)).toEqual(['mcp_1']);
    expect(result.value).toMatchObject({ catalogTotal: 2, matched: 1, returned: 1 });
  });

  test.each([{ catalog: [] }, { catalog: [mcpTool('mcp_1', 'Cloudbridge: calendars')] }])(
    'distinguishes no keyword matches from catalog size: %j',
    async ({ catalog }) => {
      const search = createPiDeferredToolDiscoveryTools(
        catalog,
        async () => ({ value: null, artifacts: [] }),
        runMetaTool,
      ).find((tool) => tool.name === PI_TOOL_SEARCH_TOOL_NAME)!;

      const result = (await execute(search, { query: 'unknown' })).details as RuntimeToolResult;

      expect(result.value).toMatchObject({
        catalogTotal: catalog.length,
        matched: 0,
        returned: 0,
        unmatchedTerms: ['unknown'],
        matchedNamespaces: [],
      });
      expect(result.value).not.toHaveProperty('truncated');
    },
  );

  test('tells the model when a search already covers the whole catalog', () => {
    expect(PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT).toContain(
      'When `returned` equals `catalogTotal`, the result is the entire catalog',
    );
    expect(PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT).toContain(
      'Do not repeat or rephrase a successful search within the same turn.',
    );
    expect(PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT).toContain('`unmatchedTerms`');
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
    expect(result.value).toMatchObject({
      catalogTotal: 20,
      matched: 20,
      returned: searchNames(result).length,
      truncated: true,
    });
    expect(searchNames(result).length).toBeGreaterThan(0);
    expect(searchNames(result).length).toBeLessThan(20);
  });
});
