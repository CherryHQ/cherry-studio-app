import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { raceAbort } from '../raceAbort';
import type { RuntimeTextGenerator } from '../types';
import { measuredStream } from './piDurableModels';
import { protectPiDurableStream } from './piDurableStream';
import {
  piModelErrorAttributes,
  piModelTerminalErrorAttributes,
  type PiModelFailureStage,
} from './piModelDiagnostics';
import type { PiRuntimeDependencies } from './piModelTypes';

const logger = loggerService.withContext('PiTextGeneration');

/** Reuse the bound provider's auth and transport without opening a conversation or model loop. */
export async function generatePiText(
  dependencies: PiRuntimeDependencies,
  request: Parameters<RuntimeTextGenerator['generateText']>[0],
  {
    signal: callerSignal,
    onText,
    onUsage,
  }: Parameters<RuntimeTextGenerator['generateText']>[1] = {},
): ReturnType<RuntimeTextGenerator['generateText']> {
  const controller = new AbortController();
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, controller.signal])
    : controller.signal;
  const requestId = globalThis.crypto.randomUUID();
  const startedAt = Date.now();
  let secrets: readonly string[] = [];
  let failureStage: PiModelFailureStage = 'model_resolution';
  try {
    signal.throwIfAborted();
    const resolved = await raceAbort(
      dependencies.resolveModel(request.model, request.options, requestId, undefined, signal),
      signal,
    );
    secrets = resolved.redactionValues;
    failureStage = 'stream';
    const effort = request.options.reasoningEffort;
    const reasoning =
      !resolved.model.reasoning || effort === 'none' || effort === 'off'
        ? undefined
        : effort === undefined || effort === 'default' || effort === 'auto'
          ? resolved.defaultThinkingLevel === 'off'
            ? undefined
            : resolved.defaultThinkingLevel
          : effort;
    const source = await raceAbort(
      resolved.streamFn(
        resolved.model,
        normalizeContext({
          messages: [
            { role: 'system', content: request.instructions, timestamp: Date.now() },
            { role: 'user', content: request.text, timestamp: Date.now() },
          ],
        }),
        {
          signal,
          sessionId: requestId,
          reasoning,
          maxTokens: Math.min(
            request.options.maxOutputTokens ?? resolved.model.maxTokens,
            resolved.model.maxTokens,
          ),
          temperature: request.options.temperature,
        },
      ),
      signal,
    );
    let text = '';
    const events = measuredStream(
      protectPiDurableStream(source, resolved.model, secrets, signal),
      startedAt,
      async (usage, metrics) => {
        await onUsage?.({
          requestId,
          context: resolved.usageContext,
          usage,
          completedAt: Date.now(),
          metrics,
        });
      },
    );
    for await (const event of events) {
      signal.throwIfAborted();
      if (event.type === 'text_delta') {
        text += event.delta;
        onText?.(text);
      }
      signal.throwIfAborted();
      if (event.type !== 'done' && event.type !== 'error') continue;
      const message = event.type === 'done' ? event.message : event.error;
      const content = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
      if (content !== text) {
        text = content;
        onText?.(text);
      }
      signal.throwIfAborted();
      if (event.type === 'error') {
        const facts = piModelTerminalErrorAttributes(message);
        throw Object.assign(
          new Error(message.errorMessage ?? 'The model failed to generate text.'),
          {
            code: facts['error.code'],
            statusCode: facts['http.status_code'],
            retryable: facts['error.retryable'],
            finishReason: message.stopReason,
          },
        );
      }
      return { finishReason: event.reason, text };
    }
    throw new Error('The model stream ended without a completion event.');
  } catch (error) {
    signal.throwIfAborted();
    const failure = normalizeAiError(error, secrets, request.model);
    logger.warn('Text generation failed', {
      requestId,
      providerId: request.model.providerId,
      modelId: request.model.modelId,
      ...piModelErrorAttributes(failure, failureStage),
    });
    // oxlint-disable-next-line preserve-caught-error -- Raw provider errors can contain OAuth tokens.
    throw new Error(failure.message, { cause: failure });
  } finally {
    controller.abort();
  }
}
