import {
  AgentApprovalViewSchema,
  AgentInputPartSchema,
  AgentMessagePartSchema,
  AgentToolRefSchema,
} from '../agent';

const MCP_TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'search' } as const;

function roundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('Agent tool and managed-file contracts', () => {
  test.each([{ source: 'builtin', capabilityId: 'calendar.read' }, MCP_TOOL_REF])(
    'round-trips the stable $source tool identity',
    (toolRef) => {
      expect(AgentToolRefSchema.parse(roundTrip(toolRef))).toEqual(toolRef);
    },
  );

  test('accepts managed file ids and rejects raw file URIs', () => {
    const input = {
      type: 'file',
      fileEntryId: 'file-1',
      mediaType: 'image/png',
      name: 'image.png',
    } as const;
    const messagePart = {
      ...input,
      id: 'file-part-1',
      purpose: 'input-attachment',
    } as const;

    expect(AgentInputPartSchema.parse(roundTrip(input))).toEqual(input);
    expect(AgentMessagePartSchema.parse(roundTrip(messagePart))).toEqual(messagePart);
    expect(
      AgentInputPartSchema.safeParse({
        type: 'file',
        mediaType: 'image/png',
        uri: 'file:///private/image.png',
      }).success,
    ).toBe(false);
  });

  test('round-trips stable tool identity and the RuntimeToolResult projection', () => {
    const part = {
      id: 'tool-part-1',
      type: 'tool',
      toolCallId: 'call-1',
      toolRef: MCP_TOOL_REF,
      providerName: 'mcp_server_1_search_a1b2',
      displayName: 'Search',
      state: 'output-available',
      input: { query: 'Cherry Studio' },
      output: {
        value: { matches: 2 },
        artifacts: [
          {
            ref: { kind: 'managed-file', fileEntryId: 'file-2' },
            mediaType: 'text/markdown',
            name: 'result.md',
            kind: 'created',
          },
        ],
      },
    } as const;

    expect(AgentMessagePartSchema.parse(roundTrip(part))).toEqual(part);
    expect(
      AgentMessagePartSchema.safeParse({
        ...part,
        toolName: 'search',
      }).success,
    ).toBe(false);
  });

  test.each(['output-available', 'denied', 'error', 'interrupted'] as const)(
    'requires a normalized result envelope for terminal state %s',
    (state) => {
      const base = {
        id: 'tool-part-1',
        type: 'tool',
        toolCallId: 'call-1',
        toolRef: MCP_TOOL_REF,
        providerName: 'mcp_server_1_search_a1b2',
        displayName: 'Search',
        state,
      } as const;

      expect(AgentMessagePartSchema.safeParse(base).success).toBe(false);
      expect(AgentMessagePartSchema.safeParse({ ...base, output: { matches: 2 } }).success).toBe(
        false,
      );
      const value =
        state === 'denied'
          ? { status: 'denied', reason: 'The user denied this tool call.' }
          : state === 'error'
            ? {
                status: 'error',
                error: {
                  code: 'tool_execution_error',
                  message: 'The tool failed to execute.',
                  retryable: false,
                },
              }
            : state === 'interrupted'
              ? { status: 'interrupted', reason: 'The turn was interrupted.' }
              : { status: 'ok' };
      expect(
        AgentMessagePartSchema.parse({
          ...base,
          output: { value, artifacts: [] },
        }),
      ).toBeDefined();
    },
  );

  test('approval round-trips a stable ref and display snapshot without a provider alias', () => {
    const approval = {
      id: 'approval-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      toolCallId: 'call-1',
      toolRef: MCP_TOOL_REF,
      displayName: 'Search',
      input: { query: 'Cherry Studio' },
      status: 'pending',
    } as const;

    expect(AgentApprovalViewSchema.parse(roundTrip(approval))).toEqual(approval);
  });
});
