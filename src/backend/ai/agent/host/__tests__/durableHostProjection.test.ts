import type { RuntimeDurableTurn } from '../../runtime';
import { projectDurableHostTurn } from '../durableHostProjection';

function turn(overrides: Partial<RuntimeDurableTurn>): RuntimeDurableTurn {
  return {
    identity: { sessionId: 'session', turnId: 'turn', requestId: 'turn' },
    userMessageId: 'user',
    assistantMessageId: 'assistant',
    inputBoundary: 'pi:1',
    answerBoundary: 'pi:2',
    status: 'completed',
    hasAssistant: true,
    usage: null,
    error: null,
    createdAt: 1_000,
    updatedAt: 9_000,
    parts: [{ id: 'answer', type: 'text', text: 'Done', state: 'done' }],
    metadata: {
      userParts: [{ id: 'question', type: 'text', text: 'Run it', state: 'done' }],
      referencedFileEntryIds: [],
      hasHistoryBeforeActiveTurn: false,
      inferenceSnapshot: {
        version: 1,
        model: {
          uniqueModelId: 'provider::model',
          providerId: 'provider',
          modelId: 'model',
          name: 'Model',
        },
        parameters: {},
        tools: [],
      },
    },
    ...overrides,
  };
}

describe('durable message timing', () => {
  test('projects native usage and failures into the aligned transcript contract', () => {
    const { user, assistant } = projectDurableHostTurn(
      turn({
        status: 'failed',
        usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15, reasoningTokens: 2 },
        error: { code: 'PROVIDER_ERROR', message: 'Request failed', retryable: true },
        parts: [
          {
            id: 'tool',
            type: 'tool',
            toolCallId: 'call',
            toolRef: { source: 'builtin', capabilityId: 'agents' },
            providerName: 'agent_get',
            displayName: 'Get Agent',
            state: 'output-available',
            input: {},
            output: { value: { ok: true }, artifacts: [] },
          },
          {
            id: 'file',
            type: 'file',
            ref: { kind: 'managed-file', fileEntryId: 'file' },
            mediaType: 'text/plain',
            name: 'result.txt',
            purpose: 'artifact',
          },
        ],
      }),
    );
    expect(user).not.toHaveProperty('usage');
    expect(assistant).not.toHaveProperty('usage');
    expect(assistant?.stats).toEqual({ inputTokens: 12, outputTokens: 3, totalTokens: 15 });
    expect(assistant?.parts).toEqual([
      expect.objectContaining({ type: 'dynamic-tool', toolName: 'agent_get', title: 'Get Agent' }),
      expect.objectContaining({ type: 'file', filename: 'result.txt' }),
      expect.objectContaining({
        type: 'data-error',
        data: expect.objectContaining({ message: 'Request failed' }),
      }),
    ]);
  });

  test('restores tool execution and approval-wait spans for the processing duration', () => {
    const { assistant } = projectDurableHostTurn(
      turn({
        timing: {
          startedAt: 2_000,
          completedAt: 10_000,
          tools: [
            { toolCallId: 'call', toolName: 'write_file', startedAt: 6_000, completedAt: 7_000 },
          ],
          approvals: [
            {
              approvalId: 'approval',
              toolCallId: 'call',
              toolName: 'Write file',
              startedAt: 3_000,
              completedAt: 6_000,
            },
          ],
        },
      }),
    );
    expect(assistant?.stats?.runtimeTiming).toEqual({
      startedAt: 2_000,
      completedAt: 10_000,
      spans: [
        {
          id: 'approval:approval',
          kind: 'approval-wait',
          approvalId: 'approval',
          toolCallId: 'call',
          toolName: 'Write file',
          startedAt: 3_000,
          completedAt: 6_000,
        },
        {
          id: 'tool:call',
          kind: 'tool-execution',
          toolCallId: 'call',
          toolName: 'write_file',
          startedAt: 6_000,
          completedAt: 7_000,
        },
      ],
    });
  });

  test('a running turn has an open wall clock and a queued input has no timing', () => {
    expect(
      projectDurableHostTurn(turn({ status: 'running', timing: { startedAt: 2_000, tools: [] } }))
        .assistant?.stats?.runtimeTiming,
    ).toEqual({ startedAt: 2_000, spans: [] });
    expect(projectDurableHostTurn(turn({ status: 'queued' })).assistant?.stats).toBeNull();
  });
});
