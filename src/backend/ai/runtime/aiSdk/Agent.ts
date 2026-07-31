/**
 * Streaming agent loop. See `docs/references/ai/agent-loop.md` in desktop.
 *
 * Mobile first slice keeps the desktop filename while narrowing the behavior
 * to plain AI SDK generate/stream calls. Agent-session, MCP tools, pending
 * message steering, and hook observers are intentionally not ported here.
 * `plugins` does accept the same `AiPlugin`s desktop's request-feature
 * wiring uses (the pluginEngine is shared via `@cherrystudio/ai-core`) —
 * callers assemble the array themselves; there is no feature registry here.
 */

import type { AiPlugin } from '@cherrystudio/ai-core';
import { createAgent } from '@cherrystudio/ai-core';
import type { StringKeys } from '@cherrystudio/ai-core/provider';
import type {
  JSONValue,
  LanguageModelUsage,
  ModelMessage,
  StopCondition,
  ToolCallRepairFunction,
  ToolSet,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import * as Crypto from 'expo-crypto';

import type { MediaCapabilities } from '../../messages/messageCapabilities';
import { toModelMessages } from '../../messages/messageRules';
import { withReasoningTimingMetadata } from '../../streamManager/withReasoningTimingMetadata';
import type { RequestContext } from '../../tools';
import type { AppProviderSettingsMap } from '../../types';
import { type ToolExecutionHooks, wrapToolsWithExecutionHooks } from './loop/hookRunner';
import { mergeUsage, toMessageMetadataPatch, ZERO_USAGE } from './observers/usage';

type AppProviderKey = StringKeys<AppProviderSettingsMap>;

export interface AgentOptions {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  maxRetries?: number;
  timeout?: number;
  headers?: Record<string, string | undefined>;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
}

export interface AgentParams<T extends AppProviderKey = AppProviderKey> {
  providerId: T;
  providerSettings: AppProviderSettingsMap[T];
  modelId: string;
  messageId?: string;
  mediaCapabilities?: MediaCapabilities;
  plugins?: AiPlugin[];
  context?: RequestContext;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  system?: string;
  tools?: ToolSet;
  toolExecutionHooks?: ToolExecutionHooks;
  options?: AgentOptions;
}

export class Agent<T extends AppProviderKey = AppProviderKey> {
  constructor(public readonly params: AgentParams<T>) {}

  private async buildAiSdkAgent() {
    const params = this.params;
    const opts = params.options ?? {};
    const tools = wrapToolsWithExecutionHooks(params.tools, params.toolExecutionHooks);
    return createAgent<AppProviderSettingsMap, T, ToolSet>({
      providerId: params.providerId,
      providerSettings: params.providerSettings,
      modelId: params.modelId,
      plugins: params.plugins,
      agentSettings: {
        experimental_context: params.context,
        experimental_repairToolCall: params.repairToolCall,
        tools,
        // System
        instructions: params.system,
        // CallSettings (model parameters)
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
        topP: opts.topP,
        topK: opts.topK,
        presencePenalty: opts.presencePenalty,
        frequencyPenalty: opts.frequencyPenalty,
        stopSequences: opts.stopSequences,
        seed: opts.seed,
        maxRetries: opts.maxRetries,
        timeout: opts.timeout,
        headers: opts.headers,
        // Provider-specific
        providerOptions: opts.providerOptions,
        stopWhen: opts.stopWhen,
      },
    });
  }

  async generate(
    input: { prompt: string } | { messages: ModelMessage[] },
    signal?: AbortSignal,
  ): Promise<{ text: string; usage: LanguageModelUsage }> {
    const aiAgent = await this.buildAiSdkAgent();
    const generateInput =
      'prompt' in input
        ? { prompt: input.prompt, ...(signal && { abortSignal: signal }) }
        : { messages: input.messages, ...(signal && { abortSignal: signal }) };
    const result = await aiAgent.generate(generateInput);
    return { text: result.text, usage: result.usage };
  }

  stream(initialMessages: UIMessage[], signal: AbortSignal): ReadableStream<UIMessageChunk> {
    const params = this.params;
    const { readable, writable } = new TransformStream<UIMessageChunk>();
    const writer = writable.getWriter();

    let writerSettled = false;
    const settleWriter = async (err?: unknown): Promise<void> => {
      if (writerSettled) return;
      writerSettled = true;
      try {
        if (err === undefined) {
          await writer.close();
        } else {
          await writer.abort(err);
        }
      } catch {
        // The transform stream's writer may already be closing from a peer
        // cancel; we only care that the terminal state was signalled once.
      }
    };

    (async () => {
      const aiAgent = await this.buildAiSdkAgent();
      let totalUsage = ZERO_USAGE;
      const result = await aiAgent.stream({
        messages: await toModelMessages(initialMessages, params.mediaCapabilities),
        abortSignal: signal,
        onStepFinish: async (step) => {
          if (!step.usage) return;
          totalUsage = mergeUsage(totalUsage, step.usage);
          await writer.write({
            type: 'message-metadata',
            messageMetadata: toMessageMetadataPatch(totalUsage),
          });
        },
      });

      const uiStream = result.toUIMessageStream({
        originalMessages: initialMessages,
        generateMessageId: () => params.messageId ?? Crypto.randomUUID(),
      });
      // Must run before this stream is read so every consumer (live UI,
      // persistence) sees the same computed startedAt/thinkingMs values.
      const reader = withReasoningTimingMetadata(uiStream).getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || signal.aborted) break;
          await writer.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    })()
      .then(() => settleWriter())
      .catch((err) => settleWriter(err));

    return readable;
  }
}
