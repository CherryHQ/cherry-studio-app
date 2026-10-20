import { newCitePrefix } from '@cherrystudio/ai-runtime/utils';
import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  JsonObject,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from '@earendil-works/pi-ai';
import { lazyStream } from '@earendil-works/pi-ai/api/lazy';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';

import type { TraceSpan } from '../../../observability';
import type { RuntimeModel, RuntimeOptions, RuntimeUsageReport } from '../types';
import { imageModelStream } from './piDurableImageModel';
import { piDurableUsage, withPiContinuationUsage } from './piDurableProjection';
import { piDurableSetupError, protectPiDurableStream } from './piDurableStream';
import {
  piModelErrorAttributes,
  piModelTerminalErrorAttributes,
  type PiModelFailureStage,
} from './piModelDiagnostics';
import type { PiRuntimeDependencies } from './piModelTypes';
import { providerErrorEvent } from './piStreamEvents';
import { disablePiToolCalls } from './piToolChoice';
import { applyPiWebReplay, PiWebResponse } from './PiWebResponse';
import { applyPiWebTools, type PiWebToolRoutes } from './piWebTools';

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
  /** Routes of a conversation request that may still use the web; absent for every other call. */
  webRoutes?: (signal: AbortSignal | undefined) => PiWebToolRoutes | undefined,
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
        let failureStage: PiModelFailureStage = 'configuration';
        try {
          // Include configuration/permission failures before a provider stream exists.
          if (model.api !== 'cherry-image') {
            trace = await traceRequest?.(options?.sessionId, options?.signal);
            trace?.setAttributes({
              'gen_ai.request.model': model.id,
              'gen_ai.provider.id': model.provider,
            });
          }
          const selected = await configuration(options?.sessionId, options?.signal);
          if (model.api === 'cherry-image') return imageModelStream(model, context);
          const reportUsage = await captureUsage?.(options?.sessionId, options?.signal);
          options?.signal?.throwIfAborted();
          failureStage = 'model_resolution';
          const resolved = await dependencies.resolveModel(
            { providerId: model.provider, modelId: model.id },
            selected,
            options?.sessionId ?? '',
            undefined,
            options?.signal,
          );
          trace?.setAttributes({
            'gen_ai.request.model': resolved.model.id,
            'gen_ai.provider.id': resolved.model.provider,
            'gen_ai.provider.api': resolved.model.api,
          });
          secrets = resolved.redactionValues;
          options?.signal?.throwIfAborted();
          const effort = selected.reasoningEffort;
          const thinking =
            !resolved.model.reasoning || effort === 'none' || effort === 'off'
              ? 'off'
              : effort === undefined || effort === 'default' || effort === 'auto'
                ? resolved.defaultThinkingLevel
                : effort;
          const onPayload = options?.onPayload;
          const withoutTools = toolFree?.(options?.signal) ?? false;
          // The stored route is intersected with the credentials this request actually resolved.
          const configured = withoutTools ? undefined : webRoutes?.(options?.signal);
          const native = resolved.nativeWebTools;
          const routes: PiWebToolRoutes = {
            search: configured?.search === 'server' && native?.search ? 'server' : 'none',
            fetch: configured?.fetch === 'server' && native?.fetch ? 'server' : 'none',
          };
          const web =
            native?.dialect && (routes.search === 'server' || routes.fetch === 'server')
              ? new PiWebResponse(
                  newCitePrefix(() => globalThis.crypto.randomUUID()),
                  native.dialect,
                )
              : undefined;
          const createStream = async (continuedContent?: JsonObject[]) => {
            const requestStartedAt = Date.now();
            const stream = await resolved.streamFn(resolved.model, context, {
              ...options,
              onPayload: async (payload: unknown, wire: Model<Api>) => {
                // A credential retry sends the request again; its metadata starts over.
                if (!continuedContent) web?.reset();
                const sent = (await onPayload?.(payload, wire)) ?? payload;
                // Pi's simple options omit tool choice on some APIs; the final payload enforces it.
                // Replay follows: a deferred server tool returns only beside its definition.
                const prepared = applyPiWebReplay(
                  withoutTools
                    ? disablePiToolCalls(sent, wire.api)
                    : applyPiWebTools(sent, native?.dialect, routes),
                  wire,
                  context.messages,
                );
                if (!continuedContent) return prepared;
                const body = prepared as { messages: unknown[] };
                return {
                  ...body,
                  messages: [...body.messages, { role: 'assistant', content: continuedContent }],
                };
              },
              ...(web
                ? {
                    onProviderStreamEvent: async (event: unknown, wire: Model<Api>) => {
                      await options?.onProviderStreamEvent?.(event, wire);
                      web.observe(event);
                    },
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
            return measuredStream(
              protectPiDurableStream(stream, resolved.model, secrets, options?.signal),
              requestStartedAt,
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
          };
          // Redaction rewrites diagnostic strings, so web facts join the message after it.
          failureStage = 'stream';
          const protectedStream = webStream(
            await createStream(),
            web,
            async (content) => {
              try {
                return await createStream(content);
              } catch (error) {
                return piDurableSetupError(
                  resolved.model,
                  error,
                  secrets,
                  options?.signal?.aborted,
                );
              }
            },
            options?.signal,
          );
          return tracedStream(protectedStream, trace, options?.signal);
        } catch (error) {
          trace?.end(
            options?.signal?.aborted ? 'cancelled' : 'error',
            options?.signal?.aborted ? undefined : piModelErrorAttributes(error, failureStage),
          );
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

async function* webStream(
  source: AsyncIterable<AssistantMessageEvent>,
  web: PiWebResponse | undefined,
  continueStream: (content: JsonObject[]) => Promise<AsyncIterable<AssistantMessageEvent>>,
  signal?: AbortSignal,
): AsyncIterable<AssistantMessageEvent> {
  let previous: AssistantMessage | undefined;
  let lastUsage: AssistantMessage['usage'] | undefined;
  let continuations = 0;
  while (true) {
    let paused: AssistantMessage | undefined;
    for await (const event of source) {
      const offset = previous?.content.length ?? 0;
      if (event.type === 'done') {
        const message = joinResponses(previous, event.message);
        if (
          web &&
          event.message.api === 'anthropic-messages' &&
          event.message.rawStopReason === 'pause_turn'
        ) {
          paused = message;
          lastUsage = event.message.usage;
          break;
        }
        const complete = previous ? withPiContinuationUsage(message, event.message.usage) : message;
        yield { ...event, message: web?.settle(complete) ?? complete };
        return;
      }
      if (event.type === 'error') {
        const combined = joinResponses(previous, event.error);
        yield {
          ...event,
          error: previous ? withPiContinuationUsage(combined, event.error.usage) : combined,
        };
        return;
      }
      if (event.type === 'start' && previous) continue;
      yield {
        ...event,
        ...('contentIndex' in event ? { contentIndex: event.contentIndex + offset } : {}),
        partial: joinResponses(previous, event.partial),
      };
    }
    if (!paused || !web) return;
    // This is continuation of the same server turn, never a retry of a completed search.
    if (signal?.aborted || continuations >= 5) {
      const failure = providerErrorEvent(
        paused,
        signal?.reason ?? new Error('The provider exceeded the web-search continuation limit.'),
        signal?.aborted,
      );
      yield { ...failure, error: withPiContinuationUsage(failure.error, lastUsage!) };
      return;
    }
    continuations++;
    previous = paused;
    source = await continueStream(web.continueAnthropic(paused.content.length));
  }
}

/** Streaming indices, partial text and billable usage continue across pause_turn responses. */
function joinResponses(
  previous: AssistantMessage | undefined,
  current: AssistantMessage,
): AssistantMessage {
  if (!previous) return current;
  const usage = { ...current.usage, cost: { ...current.usage.cost } };
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'] as const)
    usage[key] += previous.usage[key];
  for (const key of ['cacheWrite1h', 'reasoning'] as const)
    if (previous.usage[key] !== undefined || usage[key] !== undefined)
      usage[key] = (usage[key] ?? 0) + (previous.usage[key] ?? 0);
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'total'] as const)
    usage.cost[key] += previous.usage.cost[key];
  return {
    ...current,
    timestamp: previous.timestamp,
    ...(current.durationMs !== undefined
      ? { durationMs: current.timestamp + current.durationMs - previous.timestamp }
      : {}),
    content: [...previous.content, ...current.content],
    diagnostics: [...(previous.diagnostics ?? []), ...(current.diagnostics ?? [])],
    usage,
  };
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
            ...piModelTerminalErrorAttributes(message),
          },
        );
        ended = true;
      }
      yield event;
    }
  } catch (error) {
    trace?.end(
      signal?.aborted ? 'cancelled' : 'error',
      signal?.aborted ? undefined : piModelErrorAttributes(error, 'stream'),
    );
    ended = true;
    throw error;
  } finally {
    if (!ended)
      trace?.end(
        signal?.aborted ? 'cancelled' : 'error',
        signal?.aborted
          ? undefined
          : piModelErrorAttributes({ code: 'stream_incomplete' }, 'stream'),
      );
  }
}

export async function* measuredStream(
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
