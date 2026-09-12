import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';
import { type AiPlugin, definePlugin } from '@cherrystudio/ai-core';
import { extractProviderCostWithCurrency } from '@cherrystudio/ai-runtime/utils';
import type { LanguageModelMiddleware } from 'ai';
import * as Crypto from 'expo-crypto';

import type {
  AiUsageCaptureContext,
  AiUsageRecordService,
  RecordAiInvocationInput,
} from '@/backend/data/services/AiUsageRecordService';

type UsageRecorder = Pick<AiUsageRecordService, 'recordInvocation'>;

function usageToRecord(usage: LanguageModelV3Usage): NonNullable<RecordAiInvocationInput['usage']> {
  const inputTokens = usage.inputTokens.total;
  const outputTokens = usage.outputTokens.total;
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(inputTokens !== undefined || outputTokens !== undefined
      ? { totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) }
      : {}),
    ...(usage.outputTokens.reasoning !== undefined
      ? { reasoningTokens: usage.outputTokens.reasoning }
      : {}),
    ...(usage.inputTokens.noCache !== undefined
      ? { noCacheTokens: usage.inputTokens.noCache }
      : {}),
    ...(usage.inputTokens.cacheRead !== undefined
      ? { cacheReadTokens: usage.inputTokens.cacheRead }
      : {}),
    ...(usage.inputTokens.cacheWrite !== undefined
      ? { cacheWriteTokens: usage.inputTokens.cacheWrite }
      : {}),
  };
}

function semanticOutput(part: LanguageModelV3StreamPart): boolean {
  return (
    part.type === 'text-delta' ||
    part.type === 'reasoning-delta' ||
    part.type === 'tool-input-delta' ||
    part.type === 'tool-call' ||
    part.type === 'tool-result' ||
    part.type === 'file'
  );
}

function nonReasoningOutput(part: LanguageModelV3StreamPart): boolean {
  return semanticOutput(part) && part.type !== 'reasoning-delta';
}

async function recordLanguageInvocation(
  recorder: UsageRecorder,
  context: AiUsageCaptureContext,
  requestId: string,
  usage: LanguageModelV3Usage,
  metrics: RecordAiInvocationInput['metrics'],
  completedAt: number,
): Promise<void> {
  const providerCost = extractProviderCostWithCurrency(usage.raw, context.reportedCostCurrency);
  await recorder.recordInvocation({
    requestId,
    context,
    modality: 'language',
    usage: usageToRecord(usage),
    ...(providerCost ? { providerCost } : {}),
    metrics,
    completedAt,
  });
}

export function createLanguageUsageMiddleware(
  context: AiUsageCaptureContext,
  recorder: UsageRecorder,
): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      const requestId = `ai-sdk:${context.providerId}:${Crypto.randomUUID()}`;
      const startedAt = performance.now();
      const result = await doGenerate();
      await recordLanguageInvocation(
        recorder,
        context,
        requestId,
        result.usage,
        { timeCompletionMs: Math.max(0, Math.round(performance.now() - startedAt)) },
        Date.now(),
      );
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const requestId = `ai-sdk:${context.providerId}:${Crypto.randomUUID()}`;
      const startedAt = performance.now();
      const result = await doStream();
      let firstTokenAt: number | undefined;
      let thinkingStartedAt: number | undefined;
      let thinkingDurationMs: number | undefined;
      let finished = false;

      const stream = result.stream.pipeThrough(
        new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
          async transform(part, controller) {
            const now = performance.now();
            if (semanticOutput(part) && firstTokenAt === undefined) firstTokenAt = now;
            if (
              (part.type === 'reasoning-start' || part.type === 'reasoning-delta') &&
              thinkingStartedAt === undefined
            ) {
              thinkingStartedAt = now;
            }
            if (
              thinkingStartedAt !== undefined &&
              thinkingDurationMs === undefined &&
              (nonReasoningOutput(part) || part.type === 'finish')
            ) {
              thinkingDurationMs = Math.max(0, Math.round(now - thinkingStartedAt));
            }

            if (part.type === 'finish' && !finished) {
              finished = true;
              await recordLanguageInvocation(
                recorder,
                context,
                requestId,
                part.usage,
                {
                  ...(firstTokenAt !== undefined
                    ? { timeFirstTokenMs: Math.max(0, Math.round(firstTokenAt - startedAt)) }
                    : {}),
                  timeCompletionMs: Math.max(0, Math.round(now - startedAt)),
                  ...(thinkingDurationMs !== undefined
                    ? { timeThinkingMs: thinkingDurationMs }
                    : {}),
                },
                Date.now(),
              );
            }
            controller.enqueue(part);
          },
        }),
      );

      return { ...result, stream };
    },
  };
}

export function createAiUsagePlugin(
  context: AiUsageCaptureContext,
  recorder: UsageRecorder,
): AiPlugin {
  const middleware = createLanguageUsageMiddleware(context, recorder);
  return definePlugin({
    name: 'ai-usage-capture',
    configureContext(requestContext) {
      requestContext.middlewares = [...(requestContext.middlewares ?? []), middleware];
    },
  });
}
