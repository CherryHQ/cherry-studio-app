import type { AgentMessageView, JsonValue } from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import { toRuntimeHistory, toRuntimeInputParts } from '../turnRuntimeInput';

const TIMESTAMP = '2026-08-25T00:00:00.000Z';
const TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'delete_file' } as const;
const MODEL_ID = createUniqueModelId('provider-1', 'vision-model');
const OTHER_MODEL_ID = createUniqueModelId('provider-1', 'other-model');

function answer(
  id: string,
  turnId: string,
  contextTokens: number | undefined,
  modelId = MODEL_ID,
): AgentMessageView {
  return {
    id,
    sessionId: 'session-1',
    turnId,
    role: 'assistant',
    status: 'success',
    parts: [{ id: `${id}-text`, type: 'text', text: 'Answer.', state: 'done' }],
    modelId,
    inferenceSnapshot: null,
    stats: contextTokens === undefined ? null : { contextTokens },
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

describe('Turn Runtime input assembly', () => {
  test('timeline compaction markers never enter model history', () => {
    const message: AgentMessageView = {
      id: 'assistant-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'success',
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      parts: [
        {
          id: 'anchor',
          type: 'data-compaction-anchor',
          data: {
            phase: 'turn-start',
            status: 'done',
            preTokens: 100_000,
            postTokens: 20_000,
          },
        },
        { id: 'text', type: 'text', state: 'done', text: 'Answer' },
      ],
    };
    expect(toRuntimeHistory([message])).toEqual([
      {
        turnId: 'turn-1',
        messages: [{ role: 'assistant', parts: [{ type: 'text', text: 'Answer' }] }],
      },
    ]);
  });

  test('preserves explicit plugin intent in model input and user history without display metadata', () => {
    const part = {
      type: 'text' as const,
      text: '飞书 查找文档',
      pluginReferences: [{ type: 'plugin' as const, pluginId: 'feishu', label: '飞书', offset: 0 }],
    };
    const input = toRuntimeInputParts([part]);
    expect(input).toEqual([
      {
        type: 'text',
        text: `${part.text}\n\nFor this message, use the plugins explicitly selected in the composer: ["feishu"]. Other connected plugins remain available if needed.`,
      },
    ]);
    expect(toRuntimeInputParts([{ type: 'text', text: part.text }])).toEqual([
      { type: 'text', text: part.text },
    ]);
    const message: AgentMessageView = {
      id: 'user-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'user',
      status: 'success',
      parts: [{ ...part, id: 'input-0', state: 'done' }],
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
    expect(toRuntimeHistory([message])).toEqual([
      { turnId: 'turn-1', messages: [{ role: 'user', parts: input }] },
    ]);
    expect(toRuntimeHistory([{ ...message, role: 'assistant' }])[0]?.messages[0]?.parts).toEqual([
      { type: 'text', text: part.text },
    ]);
    expect(message.parts[0]).toEqual({ ...part, id: 'input-0', state: 'done' });
  });

  test('deduplicates repeated plugin mentions while preserving all selected plugins', () => {
    const input = toRuntimeInputParts([
      {
        type: 'text',
        text: '飞书 GitHub 飞书',
        pluginReferences: [
          { type: 'plugin', pluginId: 'feishu', label: '飞书', offset: 0 },
          { type: 'plugin', pluginId: 'github', label: 'GitHub', offset: 3 },
          { type: 'plugin', pluginId: 'feishu', label: '飞书', offset: 10 },
        ],
      },
    ]);
    expect(input[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('["feishu","github"]'),
    });
  });
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
          { type: 'file', fileEntryId, mediaType: 'image/png', filename: 'image.png' },
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
      filename: 'notes.txt',
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
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
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
        modelId: null,
        inferenceSnapshot: null,
        stats: null,
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
        modelId: null,
        inferenceSnapshot: null,
        stats: null,
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
          type: 'dynamic-tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          toolName: 'mcp_server_1_delete_file_a1b2',
          title: 'Delete file',
          state: 'denied',
          input: { fileEntryId: 'file-1' },
          output: {
            value: { status: 'denied', reason: 'The user denied this tool call.' },
            artifacts: [],
          },
        },
      ],
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
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
          type: 'dynamic-tool',
          toolCallId: 'tool-search-call',
          toolRef: metaRef,
          toolName: 'tool_search',
          title: 'Search tools',
          state: 'output-available',
          input: { query: 'calendar' },
          output,
        },
      ],
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
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

  test('anchors only the newest answer on its measured context, never on summed usage', () => {
    const older = answer('assistant-old', 'turn-1', 50_000);
    const newest = answer('assistant-new', 'turn-2', 90_000);

    const history = toRuntimeHistory([older, newest], new Map(), MODEL_ID);

    expect(history.map((turn) => turn.messages[0])).toEqual([
      { role: 'assistant', parts: [{ type: 'text', text: 'Answer.' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'Answer.' }], contextTokens: 90_000 },
    ]);
  });

  test.each([
    ['another model measured it', answer('a', 't', 90_000, OTHER_MODEL_ID), MODEL_ID],
    ['the newest answer has no measurement', answer('a', 't', undefined), MODEL_ID],
    ['no turn model is known', answer('a', 't', 90_000), undefined],
  ])('estimates by content when %s', (_, message, modelId) => {
    expect(toRuntimeHistory([message], new Map(), modelId)[0]?.messages[0]).not.toHaveProperty(
      'contextTokens',
    );
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
          type: 'dynamic-tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          toolName: 'mcp_server_1_delete_file_a1b2',
          title: 'Delete file',
          state: 'running',
          input: { fileEntryId: 'file-1' },
        },
      ],
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([{ turnId: 'turn-1', messages: [] }]);
  });

  test('omits an interrupted tool call that never received its input', () => {
    // The stream ended while the provider was still sending arguments: the
    // part settled as `interrupted` with no `input`. Replaying it as a call
    // with `null` arguments makes providers such as Qwen reject the next turn.
    const message: AgentMessageView = {
      id: 'assistant-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'error',
      parts: [
        { id: 'text-1', type: 'text', text: 'Let me look that up.', state: 'done' },
        {
          id: 'tool-call-1',
          type: 'dynamic-tool',
          toolCallId: 'call-1',
          toolRef: { source: 'builtin', capabilityId: 'web-search' },
          toolName: 'web_search',
          title: 'Web search',
          state: 'interrupted',
          output: {
            value: { status: 'interrupted', reason: 'The turn was interrupted.' },
            artifacts: [],
          },
        },
        {
          id: 'error-1',
          type: 'data-error',
          data: { code: 'INTERRUPTED', message: 'Connection reset', retryable: true },
        },
      ],
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([
      {
        turnId: 'turn-1',
        messages: [{ role: 'assistant', parts: [{ type: 'text', text: 'Let me look that up.' }] }],
      },
    ]);
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
          type: 'dynamic-tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          toolName: 'mcp_server_1_delete_file_a1b2',
          title: 'Delete file',
          state,
          input: { fileEntryId: 'file-1' },
          output: { value, artifacts: [] },
        },
      ],
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
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
