import type { RuntimeJsonValue } from '@/backend/ai/agent';

import { createTraceRecorder } from '../../observability/__tests__/_traceRecorder';
import {
  createMcpProviderName,
  createBoundedSignal,
  createMcpRuntimeTools,
  MCP_TOOL_CALL_TIMEOUT_MS,
  MCP_TOOL_RESULT_MAX_BYTES,
  type McpExecutableToolDescriptor,
  type McpToolInvocationCapability,
  McpRuntimeToolError,
} from '../mcpRuntimeAdapter';

const VALID_INPUT_SCHEMA: RuntimeJsonValue = {
  additionalProperties: false,
  properties: { query: { type: 'string' } },
  required: ['query'],
  type: 'object',
};

function descriptor(overrides: Partial<McpExecutableToolDescriptor> = {}) {
  return {
    description: 'Search the remote service',
    displayName: 'Search',
    endpointUrl: 'https://mcp.example/mcp',
    generation: 7,
    effect: 'read' as const,
    inputSchema: VALID_INPUT_SCHEMA,
    rawToolName: 'search',
    serverId: '00000000-0000-4000-8000-000000000001',
    ...overrides,
  } satisfies McpExecutableToolDescriptor;
}

function createTool(
  capability: McpToolInvocationCapability,
  overrides: Partial<McpExecutableToolDescriptor> = {},
) {
  return createMcpRuntimeTools(
    [{ approval: 'ask', descriptor: descriptor(overrides) }],
    capability,
  )[0]!;
}

describe('MCP Runtime adapter', () => {
  it('pins returned resource links to host-issued source metadata, never a source forged in remote JSON', async () => {
    const connectionKey = `remote:${'a'.repeat(64)}`;
    const remote = {
      content: [{ type: 'resource_link', uri: 'https://resource.example/report', name: 'Report' }],
      mcpSource: { serverId: 'forged' },
    };
    const tool = createTool({ invoke: async () => remote }, { connectionKey });
    const result = await tool.execute({
      input: { query: 'report' },
      signal: new AbortController().signal,
      toolCallId: 'call',
      turnId: 'turn',
    });
    expect(result.mcpSource).toEqual({ serverId: descriptor().serverId, connectionKey });
    expect(result.value).toEqual(remote);
    expect(result.artifacts).toEqual([]);
  });
  it.each([
    ['a remote retry-safe tool', { effect: 'read' as const }, undefined],
    ['a remote read-only tool', { effect: 'read' as const, readOnlyHint: true as const }, 'read'],
    ['a plugin read', { effect: 'read' as const, pluginId: 'feishu' }, 'read'],
    ['a plugin write', { effect: 'write' as const, pluginId: 'feishu' }, 'write'],
  ])('exposes the effect parallel answers may rely on for %s', (_label, overrides, effect) => {
    expect(createTool({ invoke: jest.fn() }, overrides).effect).toBe(effect);
  });

  it('creates stable, provider-safe aliases from stable refs', () => {
    const firstRef = {
      source: 'mcp',
      serverId: '00000000-0000-4000-8000-000000000001',
      rawToolName: 'search issues / all',
    } as const;
    const secondRef = { ...firstRef, serverId: '00000000-0000-4000-8000-000000000002' };

    expect(createMcpProviderName(firstRef)).toBe(createMcpProviderName(firstRef));
    expect(createMcpProviderName(firstRef)).not.toBe(createMcpProviderName(secondRef));
    expect(createMcpProviderName(firstRef)).toMatch(/^[a-zA-Z0-9_-]{1,63}$/);
  });

  it('fails closed on duplicate identities and digest collisions', () => {
    const capability = { invoke: jest.fn() };
    const repeated = descriptor();
    expect(() =>
      createMcpRuntimeTools(
        [
          { approval: 'ask', descriptor: repeated },
          { approval: 'ask', descriptor: repeated },
        ],
        capability,
      ),
    ).toThrow('duplicate tool identity');

    // These UUIDs have the same FNV-1a digest for the complete `mcp + server + search` identity.
    expect(() =>
      createMcpRuntimeTools(
        [
          {
            approval: 'ask',
            descriptor: descriptor({ serverId: 'e3fb350c-2e04-40fa-8cb2-c4ca73eddc45' }),
          },
          {
            approval: 'ask',
            descriptor: descriptor({ serverId: '6d99fa11-09a5-4d72-8b8a-8847d08338a6' }),
          },
        ],
        capability,
      ),
    ).toThrow('provider name collision');
  });

  it('fails closed on invalid schemas and validates input before invocation', async () => {
    const invoke = jest.fn(async () => null);
    const capability = { invoke };

    expect(() =>
      createTool(capability, { inputSchema: { properties: {}, type: 'unsupported' } }),
    ).toThrow('invalid JSON Schema');

    const tool = createTool(capability, { effect: 'write' });
    await expect(
      tool.execute({
        input: { query: 42 },
        signal: new AbortController().signal,
        toolCallId: 'call-1',
        turnId: 'turn-1',
      }),
    ).rejects.toMatchObject({ code: 'mcp_tool_input_invalid', retryable: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('carries the frozen connection and read-only constraint into invocation', async () => {
    const invoke = jest.fn(async () => null);
    const tool = createTool({ invoke }, { readOnlyHint: true });

    await tool.execute({
      input: { query: 'cherry' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
      turnId: 'turn-1',
    });

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ rawToolName: 'search', source: 'mcp' }),
      { query: 'cherry' },
      expect.any(AbortSignal),
      { endpointUrl: 'https://mcp.example/mcp', generation: 7, readOnlyHint: true },
      { sent: expect.any(Function), waiting: expect.any(Function) },
    );
  });

  it('propagates cancellation and discards a late result', async () => {
    const { traces, records } = createTraceRecorder();
    let resolveInvocation!: (value: unknown) => void;
    let invocationSignal: AbortSignal | undefined;
    const capability = {
      traces,
      invoke: jest.fn(
        (
          _ref: Parameters<McpToolInvocationCapability['invoke']>[0],
          _input: RuntimeJsonValue,
          signal: AbortSignal,
        ) => {
          invocationSignal = signal;
          return new Promise((resolve) => {
            resolveInvocation = resolve;
          });
        },
      ),
    } satisfies McpToolInvocationCapability;
    const tool = createTool(capability);
    const controller = new AbortController();

    const execution = tool.execute({
      input: { query: 'cherry' },
      signal: controller.signal,
      toolCallId: 'call-1',
      turnId: 'turn-1',
    });
    controller.abort();

    await expect(execution).rejects.toMatchObject({ code: 'mcp_tool_cancelled' });
    expect(invocationSignal?.aborted).toBe(true);
    resolveInvocation({ content: [{ text: 'late', type: 'text' }] });
    await Promise.resolve();
    expect(records.filter((record) => record.revision === 2)).toEqual([
      expect.objectContaining({
        name: 'mcp.call_tool',
        status: 'cancelled',
        attributes: expect.objectContaining({
          'error.category': 'cancelled',
          'tool.call.id': 'call-1',
        }),
      }),
    ]);
  });

  it.each([
    [undefined, false, 'mcp_tool_timeout', true],
    ['write', false, 'mcp_tool_timeout', true],
    ['read', true, 'mcp_tool_timeout', true],
    ['write', true, 'mcp_tool_write_outcome_unknown', false],
    [undefined, true, 'mcp_tool_outcome_unknown', false],
  ] as const)(
    'bounds a stalled %s call (sent: %s) as %s',
    async (effect, sent, code, retryable) => {
      jest.useFakeTimers();
      try {
        const { traces, records } = createTraceRecorder();
        const capability = {
          traces,
          invoke: jest.fn((...args: Parameters<McpToolInvocationCapability['invoke']>) => {
            if (sent) args[4].sent();
            return new Promise(() => undefined);
          }),
        } satisfies McpToolInvocationCapability;
        const execution = createTool(capability, { effect }).execute({
          input: { query: 'cherry' },
          signal: new AbortController().signal,
          toolCallId: 'call-1',
          turnId: 'turn-1',
        });

        jest.advanceTimersByTime(MCP_TOOL_CALL_TIMEOUT_MS);
        await expect(execution).rejects.toMatchObject({ code, retryable });
        expect(records.at(-1)).toMatchObject({
          status: 'error',
          attributes: {
            'error.category': 'timeout',
          },
        });
      } finally {
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    },
  );

  it.each([
    [undefined, 'mcp_tool_outcome_unknown'],
    ['read', 'mcp_tool_cancelled'],
    ['write', 'mcp_tool_write_outcome_unknown'],
  ] as const)('reports stopping a sent %s call as %s', async (effect, code) => {
    const controller = new AbortController();
    const invoke = jest.fn((...args: Parameters<McpToolInvocationCapability['invoke']>) => {
      args[4].sent();
      controller.abort();
      return new Promise(() => undefined);
    });
    await expect(
      createTool({ invoke }, { effect }).execute({
        input: { query: 'cherry' },
        signal: controller.signal,
        toolCallId: 'call-1',
        turnId: 'turn-1',
      }),
    ).rejects.toMatchObject({ code, retryable: false });
  });

  it('points the model at the saved file when the text exceeds its budget', async () => {
    const fileEntryId = '00000000-0000-4000-8000-0000000000f1';
    const remote = { content: [{ type: 'text', text: 'x'.repeat(70_000) }] };
    const tool = createTool({
      invoke: async () => remote,
      storeResult: async (value) => ({ value, artifacts: [], fullTextFileEntryId: fileEntryId }),
    });
    const result = await tool.execute({
      input: { query: 'cherry' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
      turnId: 'turn-1',
    });
    expect(result.modelContent?.at(-1)).toEqual({
      type: 'text',
      text: `[MCP text truncated: the first 65536 of 70000 characters are shown. Full text: read_file with file_entry_id ${fileEntryId}, paging with start_line and limit.]`,
    });
  });

  it('keeps a write cancelled before invocation distinct from an unknown outcome', async () => {
    const invoke = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createTool({ invoke }, { effect: 'write' }).execute({
        input: { query: 'cherry' },
        signal: controller.signal,
        toolCallId: 'write',
        turnId: 'turn-1',
      }),
    ).rejects.toMatchObject({ code: 'mcp_tool_cancelled', retryable: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('preserves a classified rejection thrown synchronously when invocation cancels', async () => {
    const controller = new AbortController();
    const rejection = new McpRuntimeToolError('mcp_tool_call_failed', 'Access denied.', false);
    const invoke = jest.fn(() => {
      controller.abort();
      throw rejection;
    });
    await expect(
      createTool({ invoke }, { effect: 'write' }).execute({
        input: { query: 'cherry' },
        signal: controller.signal,
        toolCallId: 'write',
        turnId: 'turn-1',
      }),
    ).rejects.toBe(rejection);
  });

  it.each([
    ['http', { statusCode: 401 }, { 'http.status_code': 401 }],
    ['protocol', { code: -32602 }, { 'error.code': -32602 }],
  ] as const)(
    'retains safe %s facts while redacting the error returned to callers',
    async (category, facts, attributes) => {
      const { traces, records } = createTraceRecorder();
      const capability = {
        traces,
        invoke: jest.fn(async () => {
          throw Object.assign(
            new Error(
              'POST https://private.example/mcp Authorization: Bearer secret-token\n at nativeCall',
            ),
            facts,
          );
        }),
      };

      const error = await createTool(capability)
        .execute({
          input: { query: 'cherry' },
          signal: new AbortController().signal,
          toolCallId: 'call-1',
          turnId: 'turn-1',
        })
        .catch((failure: unknown) => failure);

      expect(error).toMatchObject({
        code: 'mcp_tool_call_failed',
        message: 'The MCP tool call failed.',
        retryable: true,
        stack: undefined,
      });
      expect(JSON.stringify(error)).not.toContain('private.example');
      expect(JSON.stringify(error)).not.toContain('secret-token');
      expect(records.at(-1)).toMatchObject({
        name: 'mcp.call_tool',
        status: 'error',
        attributes: {
          ...attributes,
          'error.category': category,
          'tool.call.id': 'call-1',
        },
      });
      expect(JSON.stringify(records)).not.toMatch(
        /private\.example|secret-token|nativeCall|cherry/,
      );
    },
  );

  it('preserves plugin identity and classified failures across the tool adapter', async () => {
    const { traces, records } = createTraceRecorder();
    const failure = new McpRuntimeToolError(
      'mcp_tool_call_failed',
      'Private caller message',
      false,
      {
        pluginReason: 'access',
        statusCode: 403,
        providerCode: 99991672,
      },
    );
    const tool = createTool(
      {
        traces,
        invoke: async () => {
          throw failure;
        },
      },
      { pluginId: 'feishu' },
    );
    await expect(
      tool.execute({
        input: { query: 'private query' },
        signal: new AbortController().signal,
        toolCallId: 'call-1',
        turnId: 'turn-1',
      }),
    ).rejects.toBe(failure);
    expect(records.at(-1)).toMatchObject({
      status: 'error',
      attributes: {
        'plugin.id': 'feishu',
        'plugin.error.reason': 'access',
        'plugin.error.code': 99991672,
        'http.status_code': 403,
      },
    });
    expect(JSON.stringify(records)).not.toMatch(/Private|private query/);
  });

  it('records a tool-reported failure even when the result preview is truncated', async () => {
    const { traces, records } = createTraceRecorder();
    const tool = createTool({
      traces,
      invoke: async () => ({
        isError: true,
        content: [{ type: 'text', text: 'private'.repeat(MCP_TOOL_RESULT_MAX_BYTES) }],
      }),
    });
    const result = await tool.execute({
      input: { query: 'private query' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
      turnId: 'turn-1',
    });
    expect(result.value).toMatchObject({ truncated: true });
    expect(records.at(-1)).toMatchObject({
      status: 'error',
      attributes: { 'error.category': 'tool_result' },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });

  const remotePayloads: RuntimeJsonValue[] = [
    null,
    [],
    {
      content: [
        { text: 'hello', type: 'text' },
        { data: 'AAAA', mimeType: 'image/png', type: 'image' },
      ],
      structuredContent: { count: 1 },
    },
  ];

  it.each(remotePayloads)(
    'keeps the UI value separate from the model channel',
    async (remotePayload) => {
      const tool = createTool({ invoke: jest.fn(async () => remotePayload) });

      await expect(
        tool.execute({
          input: { query: 'cherry' },
          signal: new AbortController().signal,
          toolCallId: 'call-1',
          turnId: 'turn-1',
        }),
      ).resolves.toMatchObject({
        artifacts: [],
        value: remotePayload,
        modelContent: expect.any(Array),
      });
    },
  );

  it('projects oversized output to bounded valid JSON without retaining base64', async () => {
    const binary = 'A'.repeat(MCP_TOOL_RESULT_MAX_BYTES + 1024);
    const tool = createTool({
      invoke: jest.fn(async () => ({ content: [{ data: binary, type: 'image' }] })),
    });

    const output = await tool.execute({
      input: { query: 'cherry' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
      turnId: 'turn-1',
    });
    const serialized = JSON.stringify(output);

    expect(output).toMatchObject({
      artifacts: [],
      value: {
        originalByteSize: expect.any(Number),
        truncated: true,
      },
    });
    expect(serialized).toContain('binary string omitted');
    expect(serialized).not.toContain('A'.repeat(1024));
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

describe('MCP active request timeout', () => {
  it('excludes human wait while retaining the remaining network budget', () => {
    jest.useFakeTimers();
    try {
      const bound = createBoundedSignal(60_000);
      jest.advanceTimersByTime(20_000);
      bound.setPaused(true);
      bound.setPaused(true);
      bound.setPaused(false);
      jest.advanceTimersByTime(120_000);
      expect(bound.signal.aborted).toBe(false);
      bound.setPaused(false);
      jest.advanceTimersByTime(39_999);
      expect(bound.signal.aborted).toBe(false);
      jest.advanceTimersByTime(1);
      expect(bound.didTimeout()).toBe(true);
      bound.done();
    } finally {
      jest.useRealTimers();
    }
  });
});
