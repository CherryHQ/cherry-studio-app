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
