import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { AiPlugin } from '@cherrystudio/ai-core';
import { createAgent } from '@cherrystudio/ai-core';
import type { StringKeys } from '@cherrystudio/ai-core/provider';
import type { AppProviderSettingsMap } from '@cherrystudio/ai-runtime/provider';
import {
  type AgentLoopHooks,
  composeHooks,
  resolveToolLoopTerminalError,
  safeCall,
  type ToolExecutionHooks,
  wrapForwardedHook,
  wrapToolsWithExecutionHooks,
} from '@cherrystudio/ai-runtime/runtime';
import type { RequestContext } from '@cherrystudio/ai-runtime/tools';
import type {
  LanguageModelUsage,
  ModelMessage,
  StopCondition,
  ToolCallRepairFunction,
  ToolChoice,
  ToolSet,
} from 'ai';

import { isAbortError } from '@/backend/services/webSearch/utils/errors';
import { loggerService } from '@/shared/core/logger/LoggerService';

type AppProviderKey = StringKeys<AppProviderSettingsMap>;

const logger = loggerService.withContext('aiSdkGenerator');

export interface AiSdkGeneratorOptions {
  activeTools?: string[];
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

export interface AiSdkGeneratorParams<Key extends AppProviderKey = AppProviderKey> {
  context?: RequestContext;
  modelId: string;
  options?: AiSdkGeneratorOptions;
  plugins?: AiPlugin[];
  providerId: Key;
  providerSettings: AppProviderSettingsMap[Key];
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  system?: string;
  toolExecutionHooks?: ToolExecutionHooks;
  tools?: ToolSet;
}

export class AiSdkGenerator<Key extends AppProviderKey = AppProviderKey> {
  constructor(public readonly params: AiSdkGeneratorParams<Key>) {}

  private composedHooks(extraParts: readonly Partial<AgentLoopHooks>[] = []): AgentLoopHooks {
    const parts: Partial<AgentLoopHooks>[] = [];
    if (this.params.toolExecutionHooks) parts.push(this.params.toolExecutionHooks);
    parts.push(...extraParts);
    return composeHooks(parts);
  }

  private async buildAiSdkAgent(hooks: AgentLoopHooks) {
    const { options = {}, params } = { options: this.params.options, params: this.params };
    const tools = wrapToolsWithExecutionHooks(params.tools, hooks);
    return createAgent<AppProviderSettingsMap, Key, ToolSet>({
      agentSettings: {
        activeTools: options.activeTools as (keyof ToolSet)[] | undefined,
        experimental_context: params.context,
        experimental_repairToolCall: params.repairToolCall,
        frequencyPenalty: options.frequencyPenalty,
        headers: options.headers,
        instructions: params.system,
        maxOutputTokens: options.maxOutputTokens,
        maxRetries: options.maxRetries,
        onStepFinish: wrapForwardedHook('onStepFinish', hooks.onStepFinish),
        prepareStep: wrapForwardedHook('prepareStep', hooks.prepareStep),
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
      logger.error('AI SDK generation error', error as Error);
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
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
