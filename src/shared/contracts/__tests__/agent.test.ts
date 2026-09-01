import {
  AgentApprovalViewSchema,
  AgentErrorViewSchema,
  AgentFailureSnapshotSchema,
  AgentInferenceSnapshotV1Schema,
  AgentInputPartSchema,
  AgentMessageToolRefSchema,
  AgentMessagePartSchema,
  AgentSessionSnapshotSchema,
  AgentStartSessionInputSchema,
  AgentSubmitMessageInputSchema,
  AgentToolRefSchema,
  readAgentInferenceSnapshot,
} from '../agent';

const MCP_TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'search' } as const;

function roundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('Agent tool and managed-file contracts', () => {
  test('rejects the retired turn-only capability field', () => {
    // Capability enablement moved to the Agent record; a stale caller still
    // sending the composer-era field must fail loudly, not silently no-op.
    const input = {
      parts: [{ text: 'Draw it.', type: 'text' }],
      sessionId: 'session-1',
    } as const;

    expect(AgentSubmitMessageInputSchema.parse(roundTrip(input))).toEqual(input);
    expect(
      AgentSubmitMessageInputSchema.safeParse({
        ...input,
        temporaryCapabilities: ['web-search'],
      }).success,
    ).toBe(false);
  });

  test('validates a Draft submission without requiring a durable Session id', () => {
    const input = {
      agentId: 'agent-1',
      executionTarget: { kind: 'local' },
      parts: [{ text: 'Hello.', type: 'text' }],
    } as const;

    expect(AgentStartSessionInputSchema.parse(roundTrip(input))).toEqual(input);
    expect(
      AgentStartSessionInputSchema.safeParse({ ...input, sessionId: 'session-1' }).success,
    ).toBe(false);
  });

  test('round-trips the active first exchange used for Session handoff', () => {
    const userMessage = {
      createdAt: '2026-08-31T00:00:00.000Z',
      id: 'user-1',
      inferenceSnapshot: null,
      modelId: null,
      parts: [{ id: 'input-0', state: 'done', text: 'Hello.', type: 'text' }],
      role: 'user',
      sessionId: 'session-1',
      status: 'success',
      turnId: 'turn-1',
      updatedAt: '2026-08-31T00:00:00.000Z',
      usage: null,
    } as const;
    const assistantMessage = {
      ...userMessage,
      id: 'assistant-1',
      modelId: 'provider-1::model-1',
      parts: [],
      role: 'assistant',
      status: 'pending',
    } as const;
    const snapshot = {
      activeTurn: {
        assistantMessageId: assistantMessage.id,
        endedAt: null,
        error: null,
        id: 'turn-1',
        sessionId: 'session-1',
        startedAt: '2026-08-31T00:00:00.000Z',
        status: 'running',
      },
      activeUserMessage: userMessage,
      agent: { id: 'agent-1', name: 'Agent' },
      capabilities: { approvals: true, attachments: true, reasoning: true, tools: true },
      hasHistoryBeforeActiveTurn: false,
      pendingApprovals: [],
      session: {
        agentId: 'agent-1',
        createdAt: '2026-08-31T00:00:00.000Z',
        executionTarget: { kind: 'local' },
        // Null rather than omitted: lineage is absent, not unknown, and a JSON
        // round trip must keep telling the difference.
        forkedFromSessionId: null,
        id: 'session-1',
        title: '',
        titleIsManual: false,
        updatedAt: '2026-08-31T00:00:00.000Z',
      },
      streamingMessage: assistantMessage,
    } as const;

    expect(AgentSessionSnapshotSchema.parse(roundTrip(snapshot))).toEqual(snapshot);
  });

  test('round-trips the versioned inference snapshot and preserves unsupported versions', () => {
    const snapshot = {
      version: 1,
      model: {
        uniqueModelId: 'provider-1::model-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        apiModelId: 'served-model-1',
        name: 'Model One',
      },
      reasoningEffort: 'high',
      parameters: { temperature: 0.2, maxOutputTokens: 2048 },
      tools: [
        {
          ref: MCP_TOOL_REF,
          providerName: 'mcp_server_1_search_a1b2',
          displayName: 'Search',
          approval: 'ask',
        },
      ],
    } as const;

    expect(AgentInferenceSnapshotV1Schema.parse(roundTrip(snapshot))).toEqual(snapshot);
    expect(readAgentInferenceSnapshot(roundTrip(snapshot))).toEqual({
      status: 'supported',
      snapshot,
    });

    const future = { version: 2, opaque: { retained: true } };
    expect(readAgentInferenceSnapshot(roundTrip(future))).toEqual({
      status: 'unsupported',
      raw: future,
    });
  });

  test.each(['apiKey', 'authorization', 'endpoint', 'headers', 'callback', 'inputSchema'])(
    'rejects inference snapshot field %s outside the privacy allowlist',
    (field) => {
      expect(
        AgentInferenceSnapshotV1Schema.safeParse({
          version: 1,
          model: {
            uniqueModelId: 'provider-1::model-1',
            providerId: 'provider-1',
            modelId: 'model-1',
            name: 'Model One',
          },
          parameters: {},
          tools: [],
          [field]: 'sensitive',
        }).success,
      ).toBe(false);
    },
  );

  test.each([{ source: 'builtin', capabilityId: 'calendar.read' }, MCP_TOOL_REF])(
    'round-trips the stable $source tool identity',
    (toolRef) => {
      expect(AgentToolRefSchema.parse(roundTrip(toolRef))).toEqual(toolRef);
    },
  );

  test('accepts meta identity only for persisted message activity', () => {
    const metaRef = { source: 'meta', name: 'tool_search' } as const;

    expect(AgentMessageToolRefSchema.parse(roundTrip(metaRef))).toEqual(metaRef);
    expect(AgentToolRefSchema.safeParse(metaRef).success).toBe(false);
    expect(
      AgentMessagePartSchema.parse({
        id: 'tool-search-part',
        type: 'tool',
        toolCallId: 'tool-search-call',
        toolRef: metaRef,
        providerName: 'tool_search',
        displayName: 'Search tools',
        state: 'output-available',
        input: { query: 'calendar' },
        output: { value: { matchedNamespaces: [] }, artifacts: [] },
      }),
    ).toBeDefined();
  });

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

  test('round-trips the classified text attachment admission error', () => {
    const error = {
      code: 'ATTACHMENT_INVALID',
      message: 'Attachment "notes.txt" is not valid UTF-8 text.',
      retryable: false,
    } as const;

    expect(AgentErrorViewSchema.parse(roundTrip(error))).toEqual(error);
  });

  test('round-trips a versioned execution failure without flattening its source identity', () => {
    const failure = {
      version: 1,
      reasonCode: 'permission',
      source: { layer: 'provider', name: 'AI_APICallError', code: 'access_denied' },
      context: {
        statusCode: 403,
        providerId: 'openai',
        modelId: 'gpt-test',
        responseBody: '{"error":"access_denied"}',
      },
    } as const;
    const error = {
      code: 'EXECUTION_FAILED',
      message: 'OpenAI API error (403): access denied',
      retryable: false,
      failure,
    } as const;

    expect(AgentFailureSnapshotSchema.parse(roundTrip(failure))).toEqual(failure);
    expect(AgentErrorViewSchema.parse(roundTrip(error))).toEqual(error);
    expect(AgentErrorViewSchema.safeParse({ ...error, code: 'AGENT_NOT_FOUND' }).success).toBe(
      false,
    );
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
