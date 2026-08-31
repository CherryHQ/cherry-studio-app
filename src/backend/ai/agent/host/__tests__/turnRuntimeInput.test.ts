import type { AgentMessageView, JsonValue } from '@/shared/contracts/agent';

import { toRuntimeHistory, toRuntimeInputParts } from '../turnRuntimeInput';

const TIMESTAMP = '2026-08-25T00:00:00.000Z';
const TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'delete_file' } as const;

describe('Turn Runtime input assembly', () => {
  test('projects only ledger-authorized managed image content into Runtime input', () => {
    const fileEntryId = '00000000-0000-7000-8000-000000000001';
    const image = {
      type: 'file' as const,
      mediaType: 'image/png',
      name: 'image.png',
      uri: 'data:image/png;base64,AAAA',
    };

    expect(
      toRuntimeInputParts(
        [
          { type: 'text', text: 'Describe this.' },
          { type: 'file', fileEntryId, mediaType: 'image/png', name: 'image.png' },
        ],
        { fileEntryIds: new Set([fileEntryId]) },
        new Map([[fileEntryId, image]]),
      ),
    ).toEqual([{ type: 'text', text: 'Describe this.' }, image]);
    expect(() =>
      toRuntimeInputParts([{ type: 'file', fileEntryId, mediaType: 'image/png' }]),
    ).toThrow('outside the turn resource ledger');
  });

  test('projects resolved managed text as user content without persisting its body', () => {
    const fileEntryId = '00000000-0000-7000-8000-000000000001';
    const attachment = {
      fileEntryId,
      type: 'text-attachment' as const,
      mediaType: 'text/plain',
      name: 'notes.txt',
      text: 'untrusted managed text envelope',
      truncated: false,
      trust: 'untrusted-user-content' as const,
    };
    const filePart = {
      type: 'file' as const,
      fileEntryId,
      mediaType: 'text/plain',
      name: 'notes.txt',
    };

    expect(
      toRuntimeInputParts(
        [filePart],
        { fileEntryIds: new Set([fileEntryId]) },
        new Map([[fileEntryId, attachment]]),
      ),
    ).toEqual([attachment]);

    const message: AgentMessageView = {
      id: 'user-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'user',
      status: 'success',
      parts: [{ ...filePart, id: 'attachment-1', purpose: 'input-attachment' }],
      usage: null,
      modelId: null,
      inferenceSnapshot: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
    expect(toRuntimeHistory([message], new Map([[fileEntryId, attachment]]))).toEqual([
      { turnId: 'turn-1', messages: [{ role: 'user', parts: [attachment] }] },
    ]);
    expect(JSON.stringify(message)).not.toContain(attachment.text);
  });

  test('projects available historical input images and omits missing images and artifacts', () => {
    const availableId = '00000000-0000-7000-8000-000000000001';
    const missingId = '00000000-0000-7000-8000-000000000002';
    const messages: AgentMessageView[] = [
      {
        id: 'user-message',
        sessionId: 'session-1',
        turnId: 'turn-1',
        role: 'user',
        status: 'success',
        parts: [
          {
            id: 'available',
            type: 'file',
            fileEntryId: availableId,
            mediaType: 'image/png',
            purpose: 'input-attachment',
          },
          {
            id: 'missing',
            type: 'file',
            fileEntryId: missingId,
            mediaType: 'image/png',
            purpose: 'input-attachment',
          },
        ],
        usage: null,
        modelId: null,
        inferenceSnapshot: null,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: 'assistant-message',
        sessionId: 'session-1',
        turnId: 'turn-1',
        role: 'assistant',
        status: 'success',
        parts: [
          {
            id: 'artifact',
            type: 'file',
            fileEntryId: availableId,
            mediaType: 'image/png',
            purpose: 'artifact',
          },
        ],
        usage: null,
        modelId: null,
        inferenceSnapshot: null,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ];
    const image = {
      type: 'file' as const,
      mediaType: 'image/png',
      uri: 'data:image/png;base64,AAAA',
    };

    expect(toRuntimeHistory(messages, new Map([[availableId, image]]))).toEqual([
      { turnId: 'turn-1', messages: [{ role: 'user', parts: [image] }] },
    ]);
    expect(messages[0]?.parts).toHaveLength(2);
  });

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
      modelId: null,
      inferenceSnapshot: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([
      {
        turnId: 'turn-1',
        messages: [
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
        ],
      },
    ]);
  });

  test('replays persisted meta activity without turning it into a capability ref', () => {
    const metaRef = { source: 'meta', name: 'tool_search' } as const;
    const output: JsonValue = { value: { matchedNamespaces: [] }, artifacts: [] };
    const message: AgentMessageView = {
      id: 'assistant-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'success',
      parts: [
        {
          id: 'tool-search-part',
          type: 'tool',
          toolCallId: 'tool-search-call',
          toolRef: metaRef,
          providerName: 'tool_search',
          displayName: 'Search tools',
          state: 'output-available',
          input: { query: 'calendar' },
          output,
        },
      ],
      usage: null,
      modelId: null,
      inferenceSnapshot: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])[0]?.messages[0]?.parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tool-search-call',
        toolRef: metaRef,
        providerName: 'tool_search',
        input: { query: 'calendar' },
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-search-call',
        output,
        isError: false,
      },
    ]);
  });

  test('projects persisted assistant usage for Pi context estimation', () => {
    const message: AgentMessageView = {
      id: 'assistant-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'success',
      parts: [{ id: 'text-1', type: 'text', text: 'Answer.', state: 'done' }],
      usage: { inputTokens: 120, outputTokens: 8, totalTokens: 128 },
      modelId: null,
      inferenceSnapshot: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([
      {
        turnId: 'turn-1',
        messages: [
          {
            role: 'assistant',
            parts: [{ type: 'text', text: 'Answer.' }],
            usage: { inputTokens: 120, outputTokens: 8, totalTokens: 128 },
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
      modelId: null,
      inferenceSnapshot: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([{ turnId: 'turn-1', messages: [] }]);
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
      modelId: null,
      inferenceSnapshot: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])[0]?.messages[0]?.parts).toEqual([
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
});
