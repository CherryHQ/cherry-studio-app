import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, Model, Models, ToolResultMessage } from '@earendil-works/pi-ai';
import { buildBaseOptions } from '@earendil-works/pi-ai/api/simple-options';

import {
  convertPiMessagesToLlm,
  estimatePiLoopContextHeadroomTokens,
  estimatePiMessagesTokens,
  measurePiContext,
  PI_CONTEXT_SAFETY_MARGIN_TOKENS,
  PI_IMAGE_CONTEXT_TOKEN_RESERVE,
  PI_MIN_OUTPUT_RESERVE_TOKENS,
  planPiContext,
  planPiLoopContext,
} from '../contextCompaction';
import type { PiConversation } from '../modelMessages';

const model: Model<'openai-responses'> = {
  api: 'openai-responses',
  baseUrl: 'https://provider.example/v1',
  contextWindow: 128_000,
  cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
  id: 'test-model',
  input: ['text', 'image'],
  maxTokens: 32_768,
  name: 'Test Model',
  provider: 'test-provider',
  reasoning: false,
};

function response(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [{ type: 'text', text: 'The earlier task was completed.' }],
    stopReason: 'stop',
    timestamp: 2,
    usage: {
      input: 0,
      output: 0,
      totalTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    ...overrides,
  };
}

// Pi keeps the message that crosses keepRecentTokens, so removable history spans several turns.
function conversation(historyTokens = 0, turnTokens = 5_000): PiConversation {
  const historyTurns: PiConversation['historyTurns'] = [];
  for (let remaining = historyTokens; remaining > 0; remaining -= turnTokens) {
    historyTurns.push({
      turnId: `old-${historyTurns.length}`,
      messages: [
        { role: 'user', content: 'x'.repeat(Math.min(turnTokens, remaining) * 4), timestamp: 0 },
        response(),
      ],
    });
  }
  if (historyTokens) {
    historyTurns.push({
      turnId: 'recent',
      messages: [{ role: 'user', content: 'Continue the task.', timestamp: 3 }, response()],
    });
  }
  return {
    historyTurns,
    history: historyTurns.flatMap((turn) => turn.messages),
    prompt: { role: 'user', content: 'What is next?', timestamp: 4 },
    systemPrompt: 'Help the user.',
  };
}

function plan(
  overrides: Partial<Parameters<typeof planPiContext>[0]> = {},
  completeSimple: Models['completeSimple'] = async () => response(),
) {
  return planPiContext({
    checkpoint: null,
    conversation: conversation(),
    model,
    models: { completeSimple },
    redactSummary: (summary) => summary,
    signal: new AbortController().signal,
    thinkingLevel: 'off',
    tools: [],
    ...overrides,
  });
}

describe('Pi context admission and compaction', () => {
  test('charges a retry prefix to the current turn instead of compactible history', async () => {
    const withPrefix = conversation(100_000);
    const retainedResult: ToolResultMessage = {
      role: 'toolResult',
      toolCallId: 'retained',
      toolName: 'search',
      content: [{ type: 'text', text: 'x'.repeat(40_000 * 4) }],
      isError: false,
      timestamp: 5,
    };
    withPrefix.resume = [retainedResult];
    const completeSimple = jest.fn(async () => response());

    // The same history admits without compaction when no prefix shares the budget.
    expect(await plan({ conversation: conversation(100_000) }, completeSimple)).toMatchObject({
      ok: true,
      checkpoint: null,
    });
    expect(completeSimple).not.toHaveBeenCalled();

    const result = await plan({ conversation: withPrefix }, completeSimple);

    expect(completeSimple).toHaveBeenCalled();
    // History is summarized; the current-turn prefix is never a compaction candidate.
    expect(result.ok && result.messages).not.toContain(retainedResult);
    expect(result.ok && result.checkpoint).not.toBeNull();
  });

  test('admits a current input above the compaction trigger when Pi can shrink the output', async () => {
    const current = conversation();
    current.prompt.content = 'x'.repeat(480_000 * 4);
    const completeSimple = jest.fn(async () => response());

    const result = await plan(
      { model: { ...model, contextWindow: 500_000, maxTokens: 500_000 }, conversation: current },
      completeSimple,
    );

    expect(result).toMatchObject({ ok: true, messages: [], checkpoint: null });
    expect(completeSimple).not.toHaveBeenCalled();
  });

  test('does not compact early by adding output and compaction reserves together', async () => {
    const current = conversation(100_000);
    const completeSimple = jest.fn(async () => response());

    const result = await plan({ conversation: current }, completeSimple);

    expect(result).toMatchObject({ ok: true, messages: current.history, checkpoint: null });
    expect(completeSimple).not.toHaveBeenCalled();
  });

  test('admits only input that leaves Pi room for a usable answer', async () => {
    const admitted = conversation();
    admitted.prompt.content = 'x'.repeat(122_000 * 4);
    const rejected = conversation();
    rejected.prompt.content = 'x'.repeat(124_000 * 4);

    const result = await plan({ conversation: admitted });

    expect(result.ok).toBe(true);
    expect(
      buildBaseOptions(model, {
        systemPrompt: admitted.systemPrompt,
        messages: [admitted.prompt],
      }).maxTokens,
    ).toBeGreaterThanOrEqual(1_024);
    expect(await plan({ conversation: rejected })).toMatchObject({
      ok: false,
      code: 'context_window_exceeded',
    });
  });

  test('compacts a small window before the hard limit rejects it', async () => {
    const completeSimple = jest.fn(async () => response());

    const result = await plan(
      { conversation: conversation(11_500, 500), model: { ...model, contextWindow: 16_384 } },
      completeSimple,
    );

    expect(completeSimple).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messages[0].role).toBe('compactionSummary');
  });

  test.each([6_000, 8_000])(
    'keeps the independent input cap for %i input tokens',
    async (tokens) => {
      const current = conversation();
      current.prompt.content = 'x'.repeat(tokens * 4);

      const result = await plan({ conversation: current, maxInputTokens: 8_000 });

      expect(result.ok).toBe(tokens === 6_000);
      if (!result.ok) expect(result.code).toBe('context_window_exceeded');
    },
  );

  test('does not reserve output again inside a smaller independent input cap', async () => {
    const current = conversation(4_000);
    const completeSimple = jest.fn(async () => response());

    const result = await plan({ conversation: current, maxInputTokens: 12_000 }, completeSimple);

    expect(result).toMatchObject({ ok: true, messages: current.history, checkpoint: null });
    expect(completeSimple).not.toHaveBeenCalled();
  });

  test('allows Pi to compact removable history images instead of treating them as fixed input', async () => {
    const current = conversation();
    current.historyTurns = Array.from({ length: 9 }, (_, index) => ({
      turnId: `image-${index}`,
      messages: [
        {
          role: 'user' as const,
          content: [{ type: 'image' as const, mimeType: 'image/png', data: 'AAAA' }],
          timestamp: 0,
        },
        response(),
      ],
    }));
    current.history = current.historyTurns.flatMap((turn) => turn.messages);
    const completeSimple = jest.fn(async () => response());

    const result = await plan(
      {
        conversation: current,
        model: { ...model, contextWindow: 24_000 },
        options: { settings: { enabled: true, reserveTokens: 4_800, keepRecentTokens: 3_000 } },
      },
      completeSimple,
    );

    expect(result.ok).toBe(true);
    expect(completeSimple).toHaveBeenCalled();
    if (result.ok) expect(result.messages[0].role).toBe('compactionSummary');
  });

  test.each(['error-response', 'exception', 'oversized-summary'] as const)(
    'retains sendable context after compaction produces an %s',
    async (failure) => {
      const current = conversation(115_000);
      const completeSimple = jest.fn(async () => {
        if (failure === 'exception') throw Object.assign(new Error('Unavailable'), { status: 400 });
        return failure === 'error-response'
          ? response({ stopReason: 'error', errorMessage: 'Invalid summary request' })
          : response({ content: [{ type: 'text', text: 'x'.repeat(128_000 * 4) }] });
      });

      const result = await plan({ conversation: current }, completeSimple);

      expect(completeSimple).toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, messages: current.history, checkpoint: null });
    },
  );

  test('does not continue oversized history after compaction fails', async () => {
    const result = await plan({ conversation: conversation(130_000) }, async () =>
      response({ stopReason: 'error', errorMessage: 'Summary unavailable' }),
    );

    expect(result).toMatchObject({ ok: false, code: 'context_compaction_failed' });
  });

  test('does not let disabled compaction bypass the hard context limit', async () => {
    const result = await plan({
      conversation: conversation(130_000),
      options: { settings: { enabled: false, reserveTokens: 16_384, keepRecentTokens: 20_000 } },
    });

    expect(result).toMatchObject({ ok: false, code: 'context_window_exceeded' });
  });

  test('does not turn an aborted summary into a successful fallback', async () => {
    const result = await plan({ conversation: conversation(115_000) }, async () =>
      response({ stopReason: 'aborted' }),
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'context_compaction_failed',
      retryable: false,
    });
  });

  test('preserves cancellation when a summary rejects', async () => {
    const controller = new AbortController();
    const cancelled = new Error('Cancelled');

    await expect(
      plan({ conversation: conversation(115_000), signal: controller.signal }, async () => {
        controller.abort(cancelled);
        throw cancelled;
      }),
    ).rejects.toBe(cancelled);
  });
});

describe('Pi live context accounting', () => {
  const image: AgentMessage = {
    role: 'user',
    content: [{ type: 'image', mimeType: 'image/png', data: 'AAAA' }],
    timestamp: 0,
  };
  const tool = { name: 'search', description: 'x'.repeat(40_000), parameters: {} as never };
  const measured = response({
    usage: { ...response().usage, input: 49_000, output: 1_000, totalTokens: 50_000 },
  });
  const context = {
    contextWindow: 128_000,
    outputReserveTokens: PI_MIN_OUTPUT_RESERVE_TOKENS,
    systemPrompt: 'x'.repeat(40_000),
    tools: [tool],
  };

  test('reserves multilingual text without inflating already measured content', () => {
    const chinese: AgentMessage = { role: 'user', content: '你好世界', timestamp: 0 };
    expect(estimatePiMessagesTokens([chinese])).toBe(8);
    expect(estimatePiMessagesTokens([{ ...chinese, content: 'abcd' }])).toBe(1);
    const before = measurePiContext({ ...context, messages: [chinese, measured] });
    const after = measurePiContext({ ...context, messages: [chinese, measured, chinese] });
    expect(before.inputTokens).toBe(50_000);
    expect(after.inputTokens - before.inputTokens).toBe(8);
  });

  test('reports input admission separately from billed tokens', () => {
    const usage = measurePiContext({ ...context, systemPrompt: '', tools: [], messages: [] });
    expect(usage).toMatchObject({ inputTokens: 0, inputTokenLimit: 122_880 });
    expect(
      measurePiContext({ ...context, maxInputTokens: 8_000, messages: [measured] }),
    ).toMatchObject({ inputTokenLimit: 6_976 });
  });

  test('does not add measured system, tools, or old images a second time', () => {
    expect(estimatePiLoopContextHeadroomTokens({ ...context, messages: [image, measured] })).toBe(
      128_000 - 50_000 - PI_MIN_OUTPUT_RESERVE_TOKENS - PI_CONTEXT_SAFETY_MARGIN_TOKENS,
    );
  });

  test('still budgets images added after the last measured request', () => {
    const before = estimatePiLoopContextHeadroomTokens({ ...context, messages: [measured] });
    const after = estimatePiLoopContextHeadroomTokens({ ...context, messages: [measured, image] });

    expect(before - after).toBe(PI_IMAGE_CONTEXT_TOKEN_RESERVE);
  });

  test('still counts tool definitions introduced after the last measured request', () => {
    const result: ToolResultMessage = {
      role: 'toolResult',
      toolCallId: 'discover',
      toolName: 'discover',
      content: [{ type: 'text', text: 'Found search.' }],
      isError: false,
      timestamp: 3,
    };
    const before = estimatePiLoopContextHeadroomTokens({
      ...context,
      messages: [measured, result],
    });
    const after = estimatePiLoopContextHeadroomTokens({
      ...context,
      messages: [measured, { ...result, addedToolNames: ['search'] }],
    });

    expect(before - after).toBeGreaterThanOrEqual(10_000);
  });

  test('includes system and tool costs when no provider usage is available', () => {
    const empty = { ...context, messages: [response()] };
    const withoutPrefix = estimatePiLoopContextHeadroomTokens({
      ...empty,
      systemPrompt: '',
      tools: [],
    });
    const withPrefix = estimatePiLoopContextHeadroomTokens(empty);

    expect(withoutPrefix - withPrefix).toBeGreaterThanOrEqual(20_000);
  });
});

describe('Pi tool-loop compaction', () => {
  function pair(id: string, text: string): AgentMessage[] {
    return [
      response({
        content: [{ type: 'toolCall', id, name: 'lookup', arguments: {} }],
        stopReason: 'toolUse',
      }),
      {
        role: 'toolResult',
        toolCallId: id,
        toolName: 'lookup',
        content: [{ type: 'text', text }],
        isError: false,
        timestamp: 3,
      },
    ];
  }

  function loop(
    messages: AgentMessage[],
    overrides: Partial<Parameters<typeof planPiLoopContext>[0]> = {},
  ) {
    return planPiLoopContext({
      messages,
      systemPrompt: 'Help the user.',
      model: { ...model, contextWindow: 16_384 },
      models: { completeSimple: async () => response() },
      options: { settings: { enabled: true, reserveTokens: 4_096, keepRecentTokens: 2_000 } },
      redactSummary: (text) => text,
      signal: new AbortController().signal,
      thinkingLevel: 'off',
      tools: [],
      ...overrides,
    });
  }

  function messages(): AgentMessage[] {
    return [
      { role: 'user', content: 'Find the answer.', timestamp: 0 },
      ...pair('old', 'x'.repeat(36_000)),
      ...pair('recent', 'y'.repeat(12_000)),
    ];
  }

  test('shrinks an active turn while retaining the newest complete tool pair and emitting no durable cursor', async () => {
    const updates: unknown[] = [];
    const result = await loop(messages(), { onCompaction: (update) => updates.push(update) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.checkpoint).toBeNull();
    expect(result.messages.map((message) => message.role)).toEqual([
      'compactionSummary',
      'assistant',
      'toolResult',
    ]);
    expect(result.messages[1]).toMatchObject({
      content: [{ type: 'toolCall', id: 'recent' }],
      usage: { totalTokens: 0 },
    });
    expect(result.messages[2]).toMatchObject({ toolCallId: 'recent' });
    expect(updates).toEqual([
      expect.objectContaining({ status: 'running' }),
      expect.objectContaining({ status: 'completed', inputTokensAfter: expect.any(Number) }),
    ]);
  });

  test('keeps previous goals when compacting another prefix of the same active turn', async () => {
    const requests: string[] = [];
    await loop(
      [
        {
          role: 'compactionSummary',
          summary: 'KEEP_EARLIER_GOAL',
          tokensBefore: 20_000,
          timestamp: 0,
        },
        ...messages(),
      ],
      {
        models: {
          completeSimple: async (_model, context) => {
            requests.push(JSON.stringify(context));
            return response();
          },
        },
      },
    );
    expect(requests.some((request) => request.includes('KEEP_EARLIER_GOAL'))).toBe(true);
  });

  test('retains sendable context when summarization fails and reports the failed attempt', async () => {
    const original = messages();
    const updates: unknown[] = [];
    const result = await loop(original, {
      model: { ...model, contextWindow: 24_000 },
      options: { settings: { enabled: true, reserveTokens: 13_000, keepRecentTokens: 2_000 } },
      models: {
        completeSimple: async () => response({ stopReason: 'error', errorMessage: 'Unavailable' }),
      },
      onCompaction: (update) => updates.push(update),
    });
    expect(result).toMatchObject({ ok: true, messages: original, checkpoint: null });
    expect(updates.at(-1)).toMatchObject({ status: 'failed', reason: 'summary-failed' });
  });

  test('sends the summary to the provider as the opening user message', async () => {
    const result = await loop(messages());
    if (!result.ok) throw new Error(result.message);
    const request = convertPiMessagesToLlm(result.messages);
    expect(request.map((message) => message.role)).toEqual(['user', 'assistant', 'toolResult']);
    expect(JSON.stringify(request[0])).toContain('<summary>');
  });

  test('does not pay for a summary when the newest tool batch alone overflows', async () => {
    const completeSimple = jest.fn(async () => response());
    const updates: unknown[] = [];
    const result = await loop(
      [
        { role: 'user', content: 'Find the answer.', timestamp: 0 },
        ...pair('old', 'x'.repeat(12_000)),
        ...pair('recent', 'y'.repeat(80_000)),
      ],
      { models: { completeSimple }, onCompaction: (update) => updates.push(update) },
    );
    expect(result).toMatchObject({ ok: false, code: 'context_window_exceeded' });
    expect(completeSimple).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  test('does not return oversized context when summarization fails', async () => {
    const result = await loop(messages(), {
      models: {
        completeSimple: async () => response({ stopReason: 'error', errorMessage: 'Unavailable' }),
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'context_compaction_failed' });
  });

  test('cancels in-flight loop compaction without publishing a replacement context', async () => {
    const controller = new AbortController();
    const updates: unknown[] = [];
    await expect(
      loop(messages(), {
        signal: controller.signal,
        models: {
          completeSimple: async () => {
            controller.abort(new Error('Cancelled'));
            return response();
          },
        },
        onCompaction: (update) => updates.push(update),
      }),
    ).rejects.toThrow('Cancelled');
    expect(updates.at(-1)).toMatchObject({ status: 'cancelled', reason: 'cancelled' });
    expect(updates.some((update) => (update as { status: string }).status === 'completed')).toBe(
      false,
    );
  });
});
