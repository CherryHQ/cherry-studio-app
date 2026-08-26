import type { AgentMessageView, JsonValue } from '@/shared/contracts/agent';

import { interruptNonTerminalToolParts, toRuntimeHistory } from '../mapping';

const TIMESTAMP = '2026-08-25T00:00:00.000Z';
const TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'delete_file' } as const;

describe('Agent Host mappings', () => {
  test('replays a denied tool call as a non-error tool result', () => {
    const message: AgentMessageView = {
      id: 'assistant-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'success',
      parts: [
        {
          id: 'tool-call-1',
          type: 'tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          providerName: 'mcp_server_1_delete_file_a1b2',
          displayName: 'Delete file',
          state: 'denied',
          input: { fileEntryId: 'file-1' },
          output: {
            value: { status: 'denied', reason: 'The user denied this tool call.' },
            artifacts: [],
          },
        },
      ],
      usage: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolRef: TOOL_REF,
            providerName: 'mcp_server_1_delete_file_a1b2',
            input: { fileEntryId: 'file-1' },
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            output: {
              value: { status: 'denied', reason: 'The user denied this tool call.' },
              artifacts: [],
            },
            isError: false,
          },
        ],
      },
    ]);
  });

  test('omits a dangling tool call instead of producing unpaired Runtime history', () => {
    const message: AgentMessageView = {
      id: 'assistant-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'interrupted',
      parts: [
        {
          id: 'tool-call-1',
          type: 'tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          providerName: 'mcp_server_1_delete_file_a1b2',
          displayName: 'Delete file',
          state: 'running',
          input: { fileEntryId: 'file-1' },
        },
      ],
      usage: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([]);
  });

  test.each([
    ['output-available', false],
    ['error', true],
    ['interrupted', true],
  ] as const)('replays terminal state %s as a paired tool result', (state, isError) => {
    const value: JsonValue =
      state === 'error'
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
    const message: AgentMessageView = {
      id: 'assistant-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: state === 'interrupted' ? 'interrupted' : 'success',
      parts: [
        {
          id: 'tool-call-1',
          type: 'tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          providerName: 'mcp_server_1_delete_file_a1b2',
          displayName: 'Delete file',
          state,
          input: { fileEntryId: 'file-1' },
          output: { value, artifacts: [] },
        },
      ],
      usage: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])[0]?.parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolRef: TOOL_REF,
        providerName: 'mcp_server_1_delete_file_a1b2',
        input: { fileEntryId: 'file-1' },
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        output: { value, artifacts: [] },
        isError,
      },
    ]);
  });

  test.each(['input-available', 'awaiting-approval', 'running'] as const)(
    'terminalizes %s tool state with no pending approval',
    (state) => {
      const [part] = interruptNonTerminalToolParts(
        [
          {
            id: 'tool-call-1',
            type: 'tool',
            toolCallId: 'call-1',
            toolRef: TOOL_REF,
            providerName: 'mcp_server_1_delete_file_a1b2',
            displayName: 'Delete file',
            state,
            input: { fileEntryId: 'file-1' },
            ...(state === 'awaiting-approval' ? { approvalId: 'approval-1' } : {}),
          },
        ],
        'The app restarted.',
      );

      expect(part).toMatchObject({
        state: 'interrupted',
        output: {
          value: { status: 'interrupted', reason: 'The app restarted.' },
          artifacts: [],
        },
      });
      expect(part).not.toHaveProperty('approvalId');
    },
  );
});
