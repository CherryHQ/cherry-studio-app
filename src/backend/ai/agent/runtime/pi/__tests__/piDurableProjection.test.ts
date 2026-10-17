import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { EntryRecord, SubmissionRecord } from '@earendil-works/pi-durable';

import { toAgentMessagePart } from '../../../host/runtimeProjection';
import { PiConfigurationSchema, projectPiTurn } from '../piDurableProjection';

const writeFile = {
  ref: { source: 'builtin' as const, capabilityId: 'write_file' },
  providerName: 'write_file',
  displayName: 'Write file',
  description: 'Write a file.',
  inputSchema: {},
  inputPreview: { textField: 'content', nameField: 'filename' },
  approval: 'auto' as const,
};

test('older configurations remain readable and current replaceable instructions round-trip', () => {
  const old = {
    version: 1,
    model: { providerId: 'p', modelId: 'm' },
    instructions: 'App policy',
    options: {},
    tools: [],
  };
  expect(PiConfigurationSchema.parse(old).initialInstructions).toEqual([]);
  const current = {
    ...old,
    initialInstructions: [{ key: 'skill:notes', text: 'Current skill body' }],
  };
  expect(
    PiConfigurationSchema.parse(JSON.parse(JSON.stringify(current))).initialInstructions,
  ).toEqual(current.initialInstructions);
});
const metadata = {
  kind: 'cherry.input',
  version: 1,
  requestId: 'request',
  turnId: 'turn',
  userMessageId: 'user',
  assistantMessageId: 'assistant',
  createdAt: 1_000,
  metadata: {},
  tools: [writeFile],
};
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function call(content: string, timestamp: number, durationMs?: number): AssistantMessage {
  return {
    role: 'assistant',
    api: 'cherry',
    provider: 'provider',
    model: 'model',
    content: [
      {
        type: 'toolCall',
        id: 'call',
        name: 'write_file',
        arguments: { filename: 'notes.md', content },
      },
    ],
    stopReason: 'toolUse',
    timestamp,
    ...(durationMs !== undefined ? { durationMs } : {}),
    usage,
  };
}

describe('Pi turn projection', () => {
  test('preserves upstream loaded tool names for search presentation', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata,
      record: { id: 1, type: 'input', status: 'placed', entry: 1 } as unknown as SubmissionRecord,
      active: true,
      entries: [
        {
          id: 2,
          conversationId: 1,
          kind: 'pi.assistant',
          model: [
            {
              ...call('', 2000),
              content: [
                {
                  type: 'toolCall',
                  id: 'search',
                  name: 'tool_search',
                  arguments: { query: 'notes' },
                },
              ],
            },
          ],
        },
        {
          id: 3,
          conversationId: 1,
          kind: 'pi.tool-result',
          data: { diagnostics: [] },
          model: [
            {
              role: 'toolResult',
              toolCallId: 'search',
              toolName: 'tool_search',
              content: [{ type: 'text', text: 'Loaded 1 tool.' }],
              details: { loaded: ['mcp_notes'] },
              isError: false,
              timestamp: 2100,
            },
          ],
        },
      ] as unknown as EntryRecord[],
    });
    expect(turn.parts[0]).toMatchObject({
      type: 'tool',
      toolRef: { source: 'meta', name: 'tool_search' },
      state: 'output-available',
      output: { value: { loaded: ['mcp_notes'] } },
    });
  });

  const placed = {
    id: 1,
    type: 'input',
    status: 'placed',
    entry: 1,
  } as unknown as SubmissionRecord;

  function projectMessage(message: AssistantMessage, streaming: boolean) {
    return projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record: placed,
      metadata,
      active: true,
      entries: streaming
        ? []
        : ([
            { id: 2, conversationId: 1, kind: 'pi.assistant', model: [message] },
          ] as unknown as EntryRecord[]),
      ...(streaming ? { partial: message } : {}),
    });
  }

  test.each([true, false])(
    'joins consecutive reasoning summaries without truncating content while streaming=%s',
    (streaming) => {
      const message: AssistantMessage = {
        ...call('body', 2_000),
        api: 'openai-responses',
        content: [
          { type: 'thinking', thinking: 'Inspecting screenshot names' },
          { type: 'thinking', thinking: '正在核对截图中的玩家名称' },
          { type: 'thinking', thinking: '我按总伤害划分选手档位' },
          { type: 'text', text: 'The complete answer.' },
        ],
      };
      const turn = projectMessage(message, streaming);

      expect(turn.parts).toEqual([
        expect.objectContaining({
          type: 'reasoning',
          text: 'Inspecting screenshot names\n\n正在核对截图中的玩家名称\n\n我按总伤害划分选手档位',
          state: 'done',
        }),
        expect.objectContaining({ type: 'text', text: 'The complete answer.' }),
      ]);
      expect(message.content).toHaveLength(4);
    },
  );

  test.each([true, false])(
    'omits empty reasoning disclosures while retaining provider replay content, streaming=%s',
    (streaming) => {
      const message: AssistantMessage = {
        ...call('body', 2_000),
        api: 'openai-responses',
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'thinking', thinking: '', thinkingSignature: 'opaque-provider-replay' },
          { type: 'thinking', thinking: '\n \t' },
          { type: 'toolCall', id: 'js-call', name: 'javascript', arguments: { code: '1 + 1' } },
        ],
      };
      const turn = projectMessage(message, streaming);

      expect(turn.parts).toEqual([
        expect.objectContaining({
          type: 'tool',
          toolCallId: 'js-call',
          providerName: 'javascript',
        }),
      ]);
      expect(message.content[1]).toEqual({
        type: 'thinking',
        thinking: '',
        thinkingSignature: 'opaque-provider-replay',
      });
      expect(message.content).toHaveLength(4);
    },
  );

  test('keeps reasoning phases separated by tools and marks only the growing phase as streaming', () => {
    const message: AssistantMessage = {
      ...call('body', 2_000),
      content: [
        { type: 'thinking', thinking: 'Before the tool.' },
        call('body', 2_000).content[0]!,
        { type: 'thinking', thinking: 'After the tool.' },
        { type: 'thinking', thinking: 'More reasoning.' },
      ],
    };
    const turn = projectMessage(message, true);

    expect(turn.parts).toEqual([
      expect.objectContaining({ type: 'reasoning', text: 'Before the tool.', state: 'done' }),
      expect.objectContaining({ type: 'tool', toolCallId: 'call' }),
      expect.objectContaining({
        type: 'reasoning',
        text: 'After the tool.\n\nMore reasoning.',
        state: 'streaming',
      }),
    ]);
  });

  test('keeps a streaming reasoning indicator before the first summary text', () => {
    const message: AssistantMessage = {
      ...call('body', 2_000),
      content: [{ type: 'thinking', thinking: '' }],
    };
    const turn = projectMessage(message, true);

    expect(turn.hasAssistant).toBe(true);
    expect(turn.parts).toEqual([
      expect.objectContaining({ type: 'reasoning', state: 'streaming', text: '' }),
    ]);
  });

  test('keeps an empty streaming reasoning phase after a completed tool result', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record: placed,
      metadata,
      active: true,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000)] },
        {
          id: 3,
          conversationId: 1,
          kind: 'pi.tool-result',
          data: { diagnostics: [] },
          model: [
            {
              role: 'toolResult',
              toolCallId: 'call',
              toolName: 'write_file',
              content: [{ type: 'text', text: 'Saved' }],
              isError: false,
              timestamp: 2_100,
            },
          ],
        },
      ] as unknown as EntryRecord[],
      partial: { ...call('body', 2_200), content: [{ type: 'thinking', thinking: '' }] },
    });

    expect(turn.parts).toEqual([
      expect.objectContaining({ type: 'tool', state: 'output-available' }),
      expect.objectContaining({ type: 'reasoning', state: 'streaming', text: '' }),
    ]);
  });

  test.each([true, false])(
    'keeps consecutive retry summaries in one phase while streaming=%s',
    (streaming) => {
      const earlier: AssistantMessage = {
        ...call('body', 2_000),
        content: [{ type: 'thinking', thinking: 'Earlier summary.' }],
        stopReason: 'error',
        errorMessage: 'The provider request failed.',
      };
      const retry: AssistantMessage = {
        ...call('body', 3_000),
        content: [
          { type: 'thinking', thinking: 'Retry summary.' },
          call('body', 3_000).content[0]!,
        ],
      };
      const turn = projectPiTurn({
        lane: { sessionId: 'session', slot: 0 },
        record: placed,
        metadata,
        active: true,
        entries: [
          { id: 2, conversationId: 1, kind: 'pi.assistant', model: [earlier] },
          ...(streaming
            ? []
            : [{ id: 3, conversationId: 1, kind: 'pi.assistant', model: [retry] }]),
        ] as unknown as EntryRecord[],
        ...(streaming ? { partial: retry } : {}),
      });

      expect(turn.parts).toEqual([
        expect.objectContaining({
          id: 'pi:2:block:0',
          type: 'reasoning',
          text: 'Earlier summary.\n\nRetry summary.',
          state: 'done',
        }),
        expect.objectContaining({ type: 'tool', toolCallId: 'call' }),
      ]);
      expect(earlier.content[0]).toEqual({ type: 'thinking', thinking: 'Earlier summary.' });
      expect(retry.content[0]).toEqual({ type: 'thinking', thinking: 'Retry summary.' });
    },
  );

  test('keeps a visible reasoning phase active while its next summary is still empty', () => {
    const message: AssistantMessage = {
      ...call('body', 2_000),
      content: [
        { type: 'thinking', thinking: 'Received summary.' },
        { type: 'thinking', thinking: '' },
      ],
    };
    expect(projectMessage(message, true).parts).toEqual([
      expect.objectContaining({ type: 'reasoning', text: 'Received summary.', state: 'streaming' }),
    ]);
    expect(projectMessage(message, false).parts).toEqual([
      expect.objectContaining({ type: 'reasoning', text: 'Received summary.', state: 'done' }),
    ]);
  });

  test('recovered terminal inputs settle tool calls that have no result entry', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata,
      record: {
        id: 1,
        type: 'input',
        status: 'unanswered',
        entry: 1,
        reason: 'interrupted',
      } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000)] },
        {
          id: 3,
          conversationId: 1,
          kind: 'cherry.codemode-artifacts',
          data: {
            callId: 'call',
            artifacts: [
              {
                ref: { kind: 'managed-file', fileEntryId: 'file' },
                name: 'saved.txt',
                mediaType: 'text/plain',
                kind: 'created',
              },
            ],
          },
        },
      ] as unknown as EntryRecord[],
    });
    expect(turn.status).toBe('interrupted');
    expect(turn.parts[0]).toMatchObject({
      type: 'tool',
      state: 'interrupted',
      input: { filename: 'notes.md', content: 'body' },
      output: { value: { status: 'interrupted' }, artifacts: [] },
    });
    expect(turn.parts[1]).toMatchObject({ type: 'file', name: 'saved.txt' });
  });

  test('a failed script keeps the JavaScript capability and reports the error its output ends with', () => {
    const scriptText = `Script failed\nOutput:\n${'line\n'.repeat(100)}Script error:\nSyntaxError: unexpected token`;
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata: {
        ...metadata,
        tools: [
          {
            ...writeFile,
            ref: { source: 'builtin', capabilityId: 'run_js' },
            providerName: 'run_js',
            displayName: 'Run JavaScript',
          },
        ],
      },
      record: { id: 1, type: 'input', status: 'placed', entry: 1 } as unknown as SubmissionRecord,
      active: true,
      entries: [
        {
          id: 2,
          conversationId: 1,
          kind: 'pi.assistant',
          model: [
            {
              ...call('', 2000),
              content: [
                {
                  type: 'toolCall',
                  id: 'script',
                  name: 'codemode',
                  arguments: { code: 'const = 1' },
                },
              ],
            },
          ],
        },
        {
          id: 3,
          conversationId: 1,
          kind: 'pi.tool-result',
          data: { diagnostics: [] },
          model: [
            {
              role: 'toolResult',
              toolCallId: 'script',
              toolName: 'codemode',
              content: [{ type: 'text', text: scriptText }],
              // What the capability's afterTool hook stores for every script, failed or not.
              details: {
                kind: 'cherry.tool-result',
                ref: { source: 'builtin', capabilityId: 'run_js' },
                providerName: 'codemode',
                displayName: 'Run JavaScript',
                output: {
                  value: { output: scriptText, details: { calls: [] } },
                  modelValue: scriptText,
                  artifacts: [],
                },
              },
              isError: true,
              timestamp: 2100,
            },
          ],
        },
      ] as unknown as EntryRecord[],
    });
    const part = turn.parts[0];
    if (part?.type !== 'tool') throw new Error('Expected a tool part');
    expect(part).toMatchObject({
      toolRef: { source: 'builtin', capabilityId: 'run_js' },
      providerName: 'codemode',
      displayName: 'Run JavaScript',
      state: 'error',
    });
    // The reason is a bounded tail, so the error survives long output ahead of it.
    expect(part.error?.message.endsWith('Script error:\nSyntaxError: unexpected token')).toBe(true);
    expect(part.error!.message.length).toBeLessThan(scriptText.length);
    // The protocol accepts an error tool part only with the error result shape.
    expect(toAgentMessagePart(part)).toMatchObject({
      state: 'error',
      output: { value: { status: 'error' }, artifacts: [] },
    });
  });

  test('live child status is progress, never a final tool output', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata: {
        ...metadata,
        tools: [
          writeFile,
          {
            ...writeFile,
            ref: { source: 'mcp' as const, serverId: 'server', rawToolName: 'lookup' },
            providerName: 'mcp_lookup_0ab12cd',
            displayName: 'lookup',
          },
        ],
      },
      active: true,
      record: { id: 1, type: 'input', status: 'placed', entry: 1 } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2000)] },
      ] as unknown as EntryRecord[],
      nestedTools: new Map([
        ['child', { parentCallId: 'call', name: 'write_file', args: '{}', status: 'running' }],
        ['remote', { parentCallId: 'call', name: 'mcp_lookup_0ab12cd', args: '{}', status: 'ok' }],
      ]),
    });
    const part = turn.parts[0];
    if (part?.type !== 'tool') throw new Error('Expected a tool part');
    // The client translates built-in names; an MCP alias carries its display name.
    expect(part.progress).toEqual({
      calls: [
        { id: 'child', name: 'write_file', args: '{}', status: 'running' },
        { id: 'remote', name: 'mcp_lookup_0ab12cd', title: 'lookup', args: '{}', status: 'ok' },
      ],
    });
    expect(turn.parts[0]).not.toHaveProperty('output');
  });

  test('streams a bounded file preview instead of the growing tool input', () => {
    const record = {
      id: 1,
      type: 'input',
      status: 'placed',
      entry: 1,
    } as unknown as SubmissionRecord;
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record,
      metadata,
      entries: [],
      active: true,
      partial: call('# Notes\nfirst line', 2_000),
    });
    expect(turn.parts).toEqual([
      expect.objectContaining({
        type: 'tool',
        state: 'input-streaming',
        inputPreview: { text: '# Notes\nfirst line', truncated: false, name: 'notes.md' },
      }),
    ]);
    expect(turn.parts[0]).not.toHaveProperty('input');
    expect(turn.timing).toEqual({ startedAt: 2_000, tools: [] });
  });

  test('settled calls keep their input and time each tool from its monotonic duration', () => {
    const record = {
      id: 1,
      type: 'input',
      status: 'done',
      entry: 1,
      answer: 4,
    } as unknown as SubmissionRecord;
    const entries = [
      { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000, 500)] },
      {
        id: 3,
        conversationId: 1,
        kind: 'pi.tool-result',
        data: { diagnostics: [] },
        model: [
          {
            role: 'toolResult',
            toolCallId: 'call',
            toolName: 'write_file',
            content: [{ type: 'text', text: 'saved' }],
            isError: false,
            timestamp: 4_000,
            durationMs: 300,
          },
        ],
      },
      {
        id: 4,
        conversationId: 1,
        kind: 'pi.assistant',
        model: [
          {
            ...call('unused', 5_000, 1_000),
            content: [{ type: 'text', text: 'Done' }],
            stopReason: 'stop',
          },
        ],
      },
    ] as unknown as EntryRecord[];
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record,
      metadata,
      entries,
    });
    expect(turn.status).toBe('completed');
    expect(turn.parts[0]).toEqual(
      expect.objectContaining({
        type: 'tool',
        input: { filename: 'notes.md', content: 'body' },
      }),
    );
    expect(turn.parts[0]).not.toHaveProperty('inputPreview');
    expect(turn.timing).toEqual({
      startedAt: 2_000,
      completedAt: 6_000,
      tools: [{ toolCallId: 'call', toolName: 'write_file', startedAt: 3_700, completedAt: 4_000 }],
    });
  });
});
