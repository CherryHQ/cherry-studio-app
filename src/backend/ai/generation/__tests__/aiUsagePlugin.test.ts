import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';

import type { AiUsageCaptureContext } from '@/backend/data/services/AiUsageRecordService';

import { createLanguageUsageMiddleware } from '../aiUsagePlugin';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'usage-request') }));

describe('language usage middleware', () => {
  it('records generate usage before returning the provider result', async () => {
    const recorder = { recordInvocation: jest.fn(async () => undefined) };
    const middleware = createLanguageUsageMiddleware(captureContext(), recorder as never);
    const result = { usage: usage(), finishReason: 'stop', content: [] };

    await expect(
      middleware.wrapGenerate?.({ doGenerate: jest.fn(async () => result) } as never),
    ).resolves.toBe(result);
    expect(recorder.recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'ai-sdk:openrouter:usage-request',
        modality: 'language',
        usage: {
          inputTokens: 100,
          outputTokens: 25,
          totalTokens: 125,
          reasoningTokens: 5,
          noCacheTokens: 80,
          cacheReadTokens: 20,
          cacheWriteTokens: 0,
        },
      }),
    );
  });

  it('records one stream invocation at the finish frame', async () => {
    const recorder = { recordInvocation: jest.fn(async () => undefined) };
    const middleware = createLanguageUsageMiddleware(captureContext(), recorder as never);
    const parts = [
      { type: 'reasoning-start', id: 'reasoning-1' },
      { type: 'reasoning-delta', id: 'reasoning-1', delta: 'thinking' },
      { type: 'text-delta', id: 'text-1', delta: 'answer' },
      { type: 'finish', finishReason: 'stop', usage: usage() },
    ] as LanguageModelV3StreamPart[];
    const result = await middleware.wrapStream?.({
      doStream: jest.fn(async () => ({ stream: streamOf(parts) })),
    } as never);
    if (!result) throw new Error('expected stream result');

    await readAll(result.stream);

    expect(recorder.recordInvocation).toHaveBeenCalledTimes(1);
    expect(recorder.recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'ai-sdk:openrouter:usage-request',
        metrics: expect.objectContaining({
          timeCompletionMs: expect.any(Number),
          timeFirstTokenMs: expect.any(Number),
          timeThinkingMs: expect.any(Number),
        }),
      }),
    );
  });
});

function usage(): LanguageModelV3Usage {
  return {
    inputTokens: { total: 100, noCache: 80, cacheRead: 20, cacheWrite: 0 },
    outputTokens: { total: 25, text: 20, reasoning: 5 },
    raw: { usage: { cost: 0.01 } },
  };
}

function captureContext(): AiUsageCaptureContext {
  return {
    providerId: 'openrouter',
    providerName: 'OpenRouter',
    modelId: 'openai/gpt-5',
    modelName: 'GPT-5',
    pricingSnapshot: null,
    trustProviderReportedCost: true,
    reportedCostCurrency: 'USD',
    credentialReceipt: { attribution: 'unknown' },
    source: null,
    messageRef: null,
  };
}

function streamOf(parts: LanguageModelV3StreamPart[]): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<LanguageModelV3StreamPart>): Promise<void> {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // Drain the transformed provider stream.
  }
}
