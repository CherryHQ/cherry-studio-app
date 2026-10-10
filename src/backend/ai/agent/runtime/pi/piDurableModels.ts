import type {
  Api,
  AssistantMessageEvent,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from '@earendil-works/pi-ai';
import { lazyStream } from '@earendil-works/pi-ai/api/lazy';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';

import type { TraceSpan } from '../../../observability';
import type { RuntimeModel, RuntimeOptions, RuntimeUsageReport } from '../types';
import { imageModelStream } from './piDurableImageModel';
import { piDurableUsage } from './piDurableProjection';
import { piDurableSetupError, protectPiDurableStream } from './piDurableStream';
import type { PiRuntimeDependencies } from './piModelTypes';
import { disablePiToolCalls } from './piToolChoice';

/** Options are resolved per invocation, including compaction and recovered requests. */
type PiRequestConfiguration = (
  providerSessionId: string | undefined,
  signal: AbortSignal | undefined,
) => Promise<RuntimeOptions>;

/** Keep Cherry identities in stored model references; materialize credentials only when sending. */
export function createPiDurableModels(
  dependencies: PiRuntimeDependencies,
  configuration: PiRequestConfiguration,
  captureUsage?: (
    providerSessionId: string | undefined,
    signal: AbortSignal | undefined,
  ) => Promise<(report: RuntimeUsageReport) => Promise<void>>,
  traceRequest?: (
    providerSessionId: string | undefined,
    signal: AbortSignal | undefined,
  ) => Promise<TraceSpan | undefined>,
  toolFree?: (signal: AbortSignal | undefined) => boolean,
) {
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const providers = new Map<string, Map<string, Model<Api>>>();

  async function registerModel(
    reference: RuntimeModel,
    kind: 'language' | 'image' = 'language',
  ): Promise<void> {
    const preflight =
      kind === 'image'
        ? {
            // The local scheduling adapter consumes no provider context and creates no summary requests.
            contextWindow: Number.MAX_SAFE_INTEGER,
            maxInputTokens: Number.MAX_SAFE_INTEGER,
            maxOutputTokens: 1,
            inputModalities: ['text'] as const,
          }
        : await dependencies.preflightModel(reference);
    const contextWindow = Math.min(preflight.contextWindow, preflight.maxInputTokens);
    if (!Number.isFinite(contextWindow) || contextWindow <= 0)
      throw new Error('The selected model has no usable input context.');
    const registered = providers.get(reference.providerId) ?? new Map<string, Model<Api>>();
    registered.set(piDurableModelKey(reference, kind), {
      api: kind === 'image' ? 'cherry-image' : 'cherry',
      provider: reference.providerId,
      id: piDurableModelKey(reference, kind),
      name: reference.modelId,
      baseUrl: '',
      // Pi has a single context window. Treat an independent input cap conservatively as that
      // window so its own compaction leaves output headroom below either configured limit.
      contextWindow,
      maxTokens: preflight.maxOutputTokens,
      input: [...preflight.inputModalities],
      reasoning: kind !== 'image',
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
    providers.set(reference.providerId, registered);

    const streamSimple = (
      model: Model<Api>,
      context: TranscriptContext,
      options?: SimpleStreamOptions,
    ) =>
      lazyStream(model, async () => {
        let secrets: readonly string[] = [];
        let trace: TraceSpan | undefined;
        try {
          const selected = await configuration(options?.sessionId, options?.signal);
          if (model.api === 'cherry-image') return imageModelStream(model, context);
          const reportUsage = await captureUsage?.(options?.sessionId, options?.signal);
          trace = await traceRequest?.(options?.sessionId, options?.signal);
          options?.signal?.throwIfAborted();
          const resolved = await dependencies.resolveModel(
            { providerId: model.provider, modelId: model.id },
            selected,
            options?.sessionId ?? '',
            undefined,
            options?.signal,
          );
          secrets = resolved.redactionValues;
          options?.signal?.throwIfAborted();
          const effort = selected.reasoningEffort;
          const thinking =
            !resolved.model.reasoning || effort === 'none' || effort === 'off'
              ? 'off'
              : effort === undefined || effort === 'default' || effort === 'auto'
                ? resolved.defaultThinkingLevel
                : effort;
          const startedAt = Date.now();
          const onPayload = options?.onPayload;
          const stream = await resolved.streamFn(resolved.model, context, {
            ...options,
            // Pi's simple options omit tool choice on some APIs; the final payload enforces it.
            ...(toolFree?.(options?.signal)
              ? {
                  onPayload: async (payload: unknown, wire: Model<Api>) =>
                    disablePiToolCalls((await onPayload?.(payload, wire)) ?? payload, wire.api),
                }
              : {}),
            reasoning: thinking === 'off' ? undefined : thinking,
            temperature: selected.temperature ?? options?.temperature,
            maxTokens: Math.min(
              resolved.model.maxTokens,
              options?.maxTokens ?? resolved.model.maxTokens,
              selected.maxOutputTokens ?? resolved.model.maxTokens,
            ),
          });
          const protectedStream = protectPiDurableStream(
            stream,
            resolved.model,
            secrets,
            options?.signal,
          );
          return measuredStream(
            tracedStream(protectedStream, trace, options?.signal),
            startedAt,
            async (usage, metrics) => {
              await reportUsage?.({
                requestId: globalThis.crypto.randomUUID(),
                usage,
                context: resolved.usageContext,
                completedAt: Date.now(),
                metrics,
              });
            },
          );
        } catch (error) {
          trace?.end(options?.signal?.aborted ? 'cancelled' : 'error');
          return piDurableSetupError(model, error, secrets, options?.signal?.aborted);
        }
      });

    models.setProvider(
      createProvider({
        id: reference.providerId,
        models: [...registered.values()],
        // Actual auth is resolved by the existing Cherry account/key adapter in the stream.
        auth: {
          apiKey: {
            name: 'Cherry-managed credentials',
            resolve: async () => ({ auth: {}, source: 'ambient' }),
          },
        },
        api: { stream: streamSimple, streamSimple },
      }),
    );
  }

  return {
    models,
    registerModel,
    getModel: (reference: RuntimeModel, kind: 'language' | 'image' = 'language') =>
      models.getModel(reference.providerId, piDurableModelKey(reference, kind)),
  };
}

export function piDurableModelKey(reference: RuntimeModel, kind: 'language' | 'image') {
  return kind === 'image' ? `cherry:image:${reference.modelId}` : reference.modelId;
}

async function* tracedStream(
  source: AsyncIterable<AssistantMessageEvent>,
  trace: TraceSpan | undefined,
  signal: AbortSignal | undefined,
) {
  let ended = false;
  try {
    for await (const event of source) {
      if (event.type === 'done' || event.type === 'error') {
        const message = event.type === 'done' ? event.message : event.error;
        trace?.end(
          event.type === 'done' ? 'ok' : message.stopReason === 'aborted' ? 'cancelled' : 'error',
          {
            'gen_ai.response.finish_reason': message.stopReason,
          },
        );
        ended = true;
      }
      yield event;
    }
  } finally {
    if (!ended) trace?.end(signal?.aborted ? 'cancelled' : 'error');
  }
}

async function* measuredStream(
  source: AsyncIterable<AssistantMessageEvent>,
  startedAt: number,
  report: (
    usage: RuntimeUsageReport['usage'],
    metrics: RuntimeUsageReport['metrics'],
  ) => Promise<void>,
): AsyncIterable<AssistantMessageEvent> {
  let firstTokenAt: number | undefined;
  let thinkingAt: number | undefined;
  let thinkingMs = 0;
  for await (const event of source) {
    const now = Date.now();
    if (event.type === 'text_delta' || event.type === 'thinking_delta') firstTokenAt ??= now;
    if (event.type === 'thinking_start') thinkingAt ??= now;
    if (event.type === 'thinking_end' && thinkingAt !== undefined) {
      thinkingMs += now - thinkingAt;
      thinkingAt = undefined;
    }
    if (event.type === 'done' || event.type === 'error') {
      const message = event.type === 'done' ? event.message : event.error;
      const usage = piDurableUsage(message.usage);
      if ((usage.totalTokens ?? 0) > 0)
        await report(usage, {
          timeCompletionMs: Math.max(0, now - startedAt),
          ...(firstTokenAt !== undefined
            ? { timeFirstTokenMs: Math.max(0, firstTokenAt - startedAt) }
            : {}),
          ...(thinkingMs || thinkingAt !== undefined
            ? {
                timeThinkingMs: Math.max(
                  0,
                  thinkingMs + (thinkingAt !== undefined ? now - thinkingAt : 0),
                ),
              }
            : {}),
        });
    }
    yield event;
  }
}
