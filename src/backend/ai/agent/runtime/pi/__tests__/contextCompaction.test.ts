import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, Model, Models, ToolResultMessage } from '@earendil-works/pi-ai';
import { buildBaseOptions } from '@earendil-works/pi-ai/api/simple-options';

import {
  estimatePiLoopContextHeadroomTokens,
  PI_CONTEXT_SAFETY_MARGIN_TOKENS,
  PI_IMAGE_CONTEXT_TOKEN_RESERVE,
  PI_MIN_OUTPUT_RESERVE_TOKENS,
  planPiContext,
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
