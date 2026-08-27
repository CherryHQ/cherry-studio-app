import type { RuntimeJsonValue } from '@/backend/ai/agent';

import {
  createMcpProviderName,
  createMcpRuntimeTools,
  MCP_TOOL_CALL_TIMEOUT_MS,
  MCP_TOOL_RESULT_MAX_BYTES,
  type McpExecutableToolDescriptor,
  type McpToolInvocationCapability,
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

    const tool = createTool(capability);
    await expect(
      tool.execute({
        input: { query: 42 },
        signal: new AbortController().signal,
        toolCallId: 'call-1',
      }),
    ).rejects.toMatchObject({ code: 'mcp_tool_input_invalid', retryable: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('carries the frozen endpoint generation into invocation', async () => {
    const invoke = jest.fn(async () => null);
    const tool = createTool({ invoke });

    await tool.execute({
      input: { query: 'cherry' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
    });

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ rawToolName: 'search', source: 'mcp' }),
      { query: 'cherry' },
      expect.any(AbortSignal),
      'https://mcp.example/mcp',
      7,
    );
  });

  it('propagates cancellation and discards a late result', async () => {
    let resolveInvocation!: (value: unknown) => void;
    let invocationSignal: AbortSignal | undefined;
    const capability = {
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
    });
    controller.abort();

    await expect(execution).rejects.toMatchObject({ code: 'mcp_tool_cancelled' });
    expect(invocationSignal?.aborted).toBe(true);
    resolveInvocation({ content: [{ text: 'late', type: 'text' }] });
    await Promise.resolve();
  });

  it('terminates a stalled call at the fixed timeout', async () => {
    jest.useFakeTimers();
    try {
      const capability = {
        invoke: jest.fn(() => new Promise(() => undefined)),
      } satisfies McpToolInvocationCapability;
      const execution = createTool(capability).execute({
        input: { query: 'cherry' },
        signal: new AbortController().signal,
        toolCallId: 'call-1',
      });

      jest.advanceTimersByTime(MCP_TOOL_CALL_TIMEOUT_MS);
      await expect(execution).rejects.toMatchObject({
        code: 'mcp_tool_timeout',
        retryable: true,
      });
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('redacts native invocation failures into a stable error', async () => {
    const capability = {
      invoke: jest.fn(async () => {
        throw new Error(
          'POST https://private.example/mcp Authorization: Bearer secret-token\n at nativeCall',
        );
      }),
    };

    const error = await createTool(capability)
      .execute({
        input: { query: 'cherry' },
        signal: new AbortController().signal,
        toolCallId: 'call-1',
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
    'keeps JSON payloads inside value and never creates artifacts',
    async (remotePayload) => {
      const tool = createTool({ invoke: jest.fn(async () => remotePayload) });

      await expect(
        tool.execute({
          input: { query: 'cherry' },
          signal: new AbortController().signal,
          toolCallId: 'call-1',
        }),
      ).resolves.toEqual({ artifacts: [], value: remotePayload });
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
