import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { AiPlugin } from '@cherrystudio/ai-core';
import { createAgent } from '@cherrystudio/ai-core';
import type { StringKeys } from '@cherrystudio/ai-core/provider';
import type { MediaCapabilities } from '@cherrystudio/ai-runtime/messages';
import { toModelMessages } from '@cherrystudio/ai-runtime/messages';
import type { AppProviderSettingsMap } from '@cherrystudio/ai-runtime/provider';
import {
  type AgentLoopHooks,
  composeHooks,
  mergeUsage,
  resolveToolLoopTerminalError,
  safeCall,
  toMessageMetadataPatch,
  type ToolExecutionHooks,
  withReasoningTimingMetadata,
  wrapForwardedHook,
  wrapToolsWithExecutionHooks,
  ZERO_USAGE,
} from '@cherrystudio/ai-runtime/runtime';
import type {
  LanguageModelUsage,
  ModelMessage,
  StopCondition,
  ToolCallRepairFunction,
  ToolChoice,
  ToolSet,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import * as Crypto from 'expo-crypto';

import { isAbortError } from '@/backend/services/webSearch/utils/errors';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { RequestContext } from '../../tools';

type AppProviderKey = StringKeys<AppProviderSettingsMap>;

const logger = loggerService.withContext('agentLoop');

export interface AgentOptions {
  activeTools?: string[];
  firstStepToolChoice?: ToolChoice<ToolSet>;
  frequencyPenalty?: number;
  headers?: Record<string, string | undefined>;
  maxOutputTokens?: number;
  maxRetries?: number;
  presencePenalty?: number;
  providerOptions?: ProviderOptions;
  seed?: number;
  stopSequences?: string[];
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  temperature?: number;
  timeout?: number;
  toolChoice?: ToolChoice<ToolSet>;
  topK?: number;
  topP?: number;
}

export interface AgentParams<Key extends AppProviderKey = AppProviderKey> {
  context?: RequestContext;
  mediaCapabilities?: MediaCapabilities;
  messageId?: string;
  modelId: string;
  options?: AgentOptions;
  plugins?: AiPlugin[];
  providerId: Key;
  providerSettings: AppProviderSettingsMap[Key];
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  system?: string;
  toolExecutionHooks?: ToolExecutionHooks;
  tools?: ToolSet;
}

export class Agent<Key extends AppProviderKey = AppProviderKey> {
  constructor(public readonly params: AgentParams<Key>) {}

  private composedHooks(extraParts: ReadonlyArray<Partial<AgentLoopHooks>> = []): AgentLoopHooks {
    const parts: Array<Partial<AgentLoopHooks>> = [];
    if (this.params.toolExecutionHooks) parts.push(this.params.toolExecutionHooks);
    parts.push(...extraParts);
    return composeHooks(parts);
  }

  private async buildAiSdkAgent(hooks: AgentLoopHooks) {
    const { options = {}, params } = { options: this.params.options, params: this.params };
    const tools = wrapToolsWithExecutionHooks(params.tools, hooks);
    const forwardedPrepareStep = wrapForwardedHook('prepareStep', hooks.prepareStep);
    const prepareStep: AgentLoopHooks['prepareStep'] = options.firstStepToolChoice
      ? async (input) => {
          const prepared = await forwardedPrepareStep?.(input);
          if (input.stepNumber !== 0) return prepared;
          return { ...prepared, toolChoice: options.firstStepToolChoice };
        }
      : forwardedPrepareStep;
    return createAgent<AppProviderSettingsMap, Key, ToolSet>({
      agentSettings: {
        activeTools: options.activeTools as Array<keyof ToolSet> | undefined,
        experimental_context: params.context,
        experimental_repairToolCall: params.repairToolCall,
        frequencyPenalty: options.frequencyPenalty,
        headers: options.headers,
        instructions: params.system,
        maxOutputTokens: options.maxOutputTokens,
        maxRetries: options.maxRetries,
        onStepFinish: wrapForwardedHook('onStepFinish', hooks.onStepFinish),
        prepareStep,
        presencePenalty: options.presencePenalty,
        providerOptions: options.providerOptions,
        seed: options.seed,
        stopSequences: options.stopSequences,
        stopWhen: options.stopWhen,
        temperature: options.temperature,
        timeout: options.timeout,
        toolChoice: options.toolChoice,
        tools,
        topK: options.topK,
        topP: options.topP,
      },
      modelId: params.modelId,
      plugins: params.plugins,
      providerId: params.providerId,
      providerSettings: params.providerSettings,
    });
  }

  async generate(
    input: { messages: ModelMessage[] } | { prompt: string },
    signal?: AbortSignal,
  ): Promise<{ text: string; usage: LanguageModelUsage }> {
    const hooks = this.composedHooks();
    try {
      await safeCall('onStart', hooks.onStart);
      signal?.throwIfAborted();
      const aiAgent = await this.buildAiSdkAgent(hooks);
      const generateInput =
        'prompt' in input
          ? { prompt: input.prompt, ...(signal ? { abortSignal: signal } : {}) }
          : { messages: input.messages, ...(signal ? { abortSignal: signal } : {}) };
      const result = await aiAgent.generate(generateInput);
      signal?.throwIfAborted();
      const terminalError = resolveToolLoopTerminalError({
        steps: result.steps ?? [],
        stopWhen: this.params.options?.stopWhen,
      });
      if (terminalError) throw terminalError;
      await safeCall('onFinish', hooks.onFinish);
      return { text: result.text, usage: result.usage };
    } catch (error) {
      const isCancellation =
        signal?.aborted === true && (error === signal.reason || isAbortError(error));
      if (isCancellation) {
        await safeCall('onAbort', hooks.onAbort);
        throw error;
      }
      logger.error('agent generate error', error as Error);
      if (hooks.onError) {
        try {
          await hooks.onError({ error: toError(error) });
        } catch (hookError) {
          logger.error('hooks.onError threw; rethrowing original', hookError as Error);
        }
      }
      throw error;
    }
  }

  stream(initialMessages: UIMessage[], signal: AbortSignal): ReadableStream<UIMessageChunk> {
    let outputController!: TransformStreamDefaultController<UIMessageChunk>;
    let terminalOutcome: 'abort' | 'running' | 'success' = 'running';
    let committingFinish = false;
    const claimTerminalOutcome = (outcome: 'abort' | 'success') => {
      if (terminalOutcome !== 'running') return false;
      terminalOutcome = outcome;
      return true;
    };
    const { readable, writable } = new TransformStream<UIMessageChunk, UIMessageChunk>({
      start(controller) {
        outputController = controller;
      },
      transform(chunk, controller) {
        if (committingFinish && chunk.type === 'finish' && !claimTerminalOutcome('success')) return;
        controller.enqueue(chunk);
      },
    });
    const writer = writable.getWriter();

    let totalUsage = ZERO_USAGE;
    const hooks = this.composedHooks([
      {
        onStart: () => {
          totalUsage = ZERO_USAGE;
        },
        onStepFinish: async (step) => {
          if (!step.usage) return;
          totalUsage = mergeUsage(totalUsage, step.usage);
          await writer.write({
            type: 'message-metadata',
            messageMetadata: toMessageMetadataPatch(totalUsage),
          });
        },
      },
    ]);

    let writerSettled = false;
    const settleWriter = async (failure?: { error: unknown }) => {
      if (writerSettled) return;
      writerSettled = true;
      try {
        if (failure) await writer.abort(failure.error);
        else await writer.close();
      } catch {
        // The readable side may already have been cancelled.
      }
    };

    const invokeOnError = async (error: unknown) => {
      if (!hooks.onError) return undefined;
      try {
        return await hooks.onError({ error: toError(error) });
      } catch (hookError) {
        logger.error('hooks.onError threw; aborting run', hookError as Error);
        return 'abort' as const;
      }
    };

    const commitFinish = async (finish: Extract<UIMessageChunk, { type: 'finish' }>) => {
      const abortBeforeFinish = () => {
        if (!claimTerminalOutcome('abort')) return;
        try {
          outputController.terminate();
        } catch {
          // The readable side may already have been cancelled.
        }
      };
      signal.addEventListener('abort', abortBeforeFinish, { once: true });
      try {
        if (signal.aborted) abortBeforeFinish();
        if (terminalOutcome === 'abort') return false;
        committingFinish = true;
        await writer.write(finish);
        return terminalOutcome === 'success';
      } catch (error) {
        if (terminalOutcome === 'abort') return false;
        throw error;
      } finally {
        committingFinish = false;
        signal.removeEventListener('abort', abortBeforeFinish);
      }
    };

    void (async () => {
      await safeCall('onStart', hooks.onStart);
      const aiAgent = await this.buildAiSdkAgent(hooks);
      const modelMessages = await toModelMessages(
        initialMessages,
        this.params.mediaCapabilities,
        this.params.tools,
      );
      let hasUsedProvidedMessageId = false;
      const result = await aiAgent.stream({ messages: modelMessages, abortSignal: signal });
      const capturedUiErrors: Array<{ error: unknown }> = [];
      const uiStream = result.toUIMessageStream({
        generateMessageId: () => {
          if (!hasUsedProvidedMessageId && this.params.messageId) {
            hasUsedProvidedMessageId = true;
            return this.params.messageId;
          }
          return Crypto.randomUUID();
        },
        onError: (error) => {
          capturedUiErrors.push({ error });
          return error instanceof Error ? error.message : String(error);
        },
        originalMessages: initialMessages,
      });
      const reader = withReasoningTimingMetadata(uiStream).getReader();
      let readFailure: { error: unknown } | undefined;
      let pendingFinish: Extract<UIMessageChunk, { type: 'finish' }> | undefined;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const capturedError =
            value.type === 'tool-input-error' ||
            (value.type === 'tool-output-error' && !value.providerExecuted) ||
            value.type === 'error'
              ? capturedUiErrors.shift()
              : undefined;
          if (value.type === 'error' && capturedError) {
            await reader.cancel(capturedError.error).catch(() => undefined);
            throw capturedError.error;
          }
          if (signal.aborted) break;
          if (value.type === 'finish') {
            pendingFinish = value;
            continue;
          }
          await writer.write(value);
        }
      } catch (error) {
        readFailure = { error };
      } finally {
        reader.releaseLock();
      }
      if (readFailure) throw readFailure.error;
      if (signal.aborted) {
        await safeCall('onAbort', hooks.onAbort);
        return;
      }

      const steps = await Promise.resolve(result.steps);
      if (signal.aborted) {
        await safeCall('onAbort', hooks.onAbort);
        return;
      }
      const terminalError = resolveToolLoopTerminalError({
        steps: steps ?? [],
        stopWhen: this.params.options?.stopWhen,
      });
      if (terminalError) throw terminalError;
      if (pendingFinish) {
        if (!(await commitFinish(pendingFinish))) {
          await safeCall('onAbort', hooks.onAbort);
          return;
        }
      } else if (signal.aborted || !claimTerminalOutcome('success')) {
        await safeCall('onAbort', hooks.onAbort);
        return;
      }
      await safeCall('onFinish', hooks.onFinish);
    })()
      .then(() => settleWriter())
      .catch(async (error) => {
        const isCancellation = signal.aborted && (error === signal.reason || isAbortError(error));
        if (isCancellation) {
          await safeCall('onAbort', hooks.onAbort);
          await settleWriter();
          return;
        }
        const action = await invokeOnError(error);
        if (action === 'retry') {
          logger.warn('agentLoop onError returned retry; retry not implemented - aborting', error);
        } else {
          logger.error('agentLoop error', error as Error);
        }
        await settleWriter({ error });
      });

    return readable;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
