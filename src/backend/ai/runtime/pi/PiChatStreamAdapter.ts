import {
  toMessageMetadataPatch,
  withReasoningTimingMetadata,
} from '@cherrystudio/ai-runtime/runtime';
import { Agent as PiCoreAgent, type AgentOptions } from '@earendil-works/pi-agent-core/agent';
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Message as PiMessage,
  Model as PiModel,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';
import { streamSimple } from '@earendil-works/pi-ai/api/openai-responses';
import type { LanguageModelUsage, ProviderMetadata, UIMessage, UIMessageChunk } from 'ai';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  AiUsageCaptureContext,
  AiUsageRecordService,
  RecordAiInvocationInput,
} from '@/backend/data/services/AiUsageRecordService';
import { isAbortError } from '@/backend/services/webSearch/utils/errors';

const EMPTY_PI_USAGE: PiUsage = {
  cacheRead: 0,
  cacheWrite: 0,
  cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
  input: 0,
  output: 0,
  totalTokens: 0,
};

export type PiChatThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PiChatStreamAdapterOptions {
  apiKey: string;
  baseUrl: string;
  contextWindow: number;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  maxOutputTokens: number;
  maxRetries: number;
  messageId?: string;
  modelId: string;
  modelName: string;
  providerId: string;
  providerName: string;
  sessionId?: string;
  supportsReasoning?: boolean;
  system?: string;
  temperature?: number;
  thinkingLevel: PiChatThinkingLevel;
  timeoutMs: number;
  usageCapture?: {
    context: AiUsageCaptureContext;
    recorder: Pick<AiUsageRecordService, 'recordInvocation'>;
  };
}

type TimingState = {
  firstTokenAt?: number;
  startedAt: number;
  thinkingDurationMs?: number;
  thinkingStartedAt?: number;
};

export class PiChatStreamAdapter {
  constructor(private readonly options: PiChatStreamAdapterOptions) {
    if (!options.baseUrl.trim()) throw new Error('Pi chat runtime requires a base URL');
    if (!options.modelId.trim()) throw new Error('Pi chat runtime requires a model ID');
  }

  stream(messages: UIMessage[], signal: AbortSignal): ReadableStream<UIMessageChunk> {
    signal.throwIfAborted();
    const conversation = toPiConversation(messages, this.options);
    let activeAgent: PiCoreAgent | undefined;
    const rawStream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        void this.run(conversation, signal, controller, (agent) => {
          activeAgent = agent;
        });
      },
      cancel: () => {
        activeAgent?.abort();
      },
    });

    return withReasoningTimingMetadata(rawStream);
  }

  private async run(
    conversation: PiConversation,
    signal: AbortSignal,
    controller: ReadableStreamDefaultController<UIMessageChunk>,
    setActiveAgent: (agent: PiCoreAgent) => void,
  ): Promise<void> {
    const timing: TimingState = { startedAt: performance.now() };
    let terminalMessage: AssistantMessage | undefined;
    const streamFn: AgentOptions['streamFn'] = (model, context, options) =>
      streamSimple(model as PiModel<'openai-responses'>, context, {
        ...options,
        apiKey: this.options.apiKey,
        fetch: this.options.fetch ?? (expoFetch as typeof globalThis.fetch),
        headers: this.options.headers,
        maxRetries: this.options.maxRetries,
        maxTokens: this.options.maxOutputTokens,
        temperature: this.options.temperature,
        timeoutMs: this.options.timeoutMs,
      });
    const agent = new PiCoreAgent({
      getApiKey: () => this.options.apiKey,
      initialState: {
        messages: conversation.history,
        model: createPiModel(this.options),
        systemPrompt: this.options.system ?? '',
        thinkingLevel: this.options.thinkingLevel,
        tools: [],
      },
      sessionId: this.options.sessionId,
      shouldStopAfterTurn: () => true,
      streamFn,
    });
    setActiveAgent(agent);

    const unsubscribe = agent.subscribe(async (event) => {
      if (event.type === 'message_update') {
        noteTiming(event.assistantMessageEvent, timing);
        const chunk = toUiChunk(event.assistantMessageEvent);
        if (chunk) controller.enqueue(chunk);
      }
      if (event.type === 'turn_end' && isAssistantMessage(event.message)) {
        terminalMessage = event.message;
      }
    });
    const abortAgent = () => agent.abort();
    signal.addEventListener('abort', abortAgent, { once: true });

    try {
      controller.enqueue({
        messageId: this.options.messageId ?? Crypto.randomUUID(),
        type: 'start',
      });
      await agent.prompt(conversation.prompt);
      signal.throwIfAborted();
      if (!terminalMessage) throw new Error('Pi agent completed without an assistant response');

      const usage = toLanguageModelUsage(terminalMessage.usage);
      controller.enqueue({
        messageMetadata: toMessageMetadataPatch(usage),
        type: 'message-metadata',
      });
      await this.recordUsage(terminalMessage.usage, timing);

      switch (terminalMessage.stopReason) {
        case 'stop':
        case 'length':
          controller.enqueue({
            finishReason: terminalMessage.stopReason,
            type: 'finish',
          });
          controller.close();
          return;
        case 'aborted':
          closeQuietly(controller);
          return;
        case 'error':
          throw new Error(terminalMessage.errorMessage ?? 'Pi agent request failed');
        case 'toolUse':
          throw new Error('Pi chat runtime does not support tool calls in this transition stage');
        case 'deferred':
        case 'pending':
          throw new Error(
            `Pi chat runtime received unsupported stop reason: ${terminalMessage.stopReason}`,
          );
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        closeQuietly(controller);
        return;
      }
      controller.error(error);
    } finally {
      signal.removeEventListener('abort', abortAgent);
      unsubscribe();
    }
  }

  private async recordUsage(usage: PiUsage, timing: TimingState): Promise<void> {
    const capture = this.options.usageCapture;
    if (!capture) return;

    const now = performance.now();
    const thinkingDurationMs =
      timing.thinkingDurationMs ??
      (timing.thinkingStartedAt !== undefined
        ? Math.max(0, Math.round(now - timing.thinkingStartedAt))
        : undefined);
    const metrics: NonNullable<RecordAiInvocationInput['metrics']> = {
      ...(timing.firstTokenAt !== undefined
        ? { timeFirstTokenMs: Math.max(0, Math.round(timing.firstTokenAt - timing.startedAt)) }
        : {}),
      timeCompletionMs: Math.max(0, Math.round(now - timing.startedAt)),
      ...(thinkingDurationMs !== undefined ? { timeThinkingMs: thinkingDurationMs } : {}),
    };
    await capture.recorder.recordInvocation({
      completedAt: Date.now(),
      context: capture.context,
      metrics,
      modality: 'language',
      requestId: `pi:${this.options.providerId}:${Crypto.randomUUID()}`,
      usage: toUsageRecord(usage),
    });
  }
}

type PiConversation = {
  history: PiMessage[];
  prompt: Extract<PiMessage, { role: 'user' }>;
};

function toPiConversation(
  messages: UIMessage[],
  options: PiChatStreamAdapterOptions,
): PiConversation {
  if (messages.length === 0) throw new Error('Pi chat runtime requires a user message');
  const converted = messages.map((message) => toPiMessage(message, options));
  const prompt = converted.at(-1);
  if (!prompt || prompt.role !== 'user') {
    throw new Error('Pi chat runtime requires the latest message to be from the user');
  }
  return { history: converted.slice(0, -1), prompt };
}

function toPiMessage(message: UIMessage, options: PiChatStreamAdapterOptions): PiMessage {
  if (message.role === 'user') {
    const text = message.parts.map((part) => {
      if (part.type !== 'text') throw unsupportedPart(part.type);
      return part.text;
    });
    return { content: text.join(''), role: 'user', timestamp: Date.now() };
  }

  if (message.role === 'assistant') {
    const content: AssistantMessage['content'] = message.parts.map((part) => {
      if (part.type === 'text') {
        const metadata = piMetadata(part.providerMetadata);
        return {
          text: part.text,
          ...(typeof metadata?.textSignature === 'string'
            ? { textSignature: metadata.textSignature }
            : {}),
          type: 'text',
        };
      }
      if (part.type === 'reasoning') {
        const metadata = piMetadata(part.providerMetadata);
        return {
          thinking: part.text,
          ...(typeof metadata?.thinkingSignature === 'string'
            ? { thinkingSignature: metadata.thinkingSignature }
            : {}),
          ...(typeof metadata?.redacted === 'boolean' ? { redacted: metadata.redacted } : {}),
          type: 'thinking',
        };
      }
      throw unsupportedPart(part.type);
    });
    return {
      api: 'openai-responses',
      content,
      model: options.modelId,
      provider: options.providerId,
      role: 'assistant',
      stopReason: 'stop',
      timestamp: Date.now(),
      usage: EMPTY_PI_USAGE,
    };
  }

  throw new Error(`Pi chat runtime does not support message role: ${message.role}`);
}

function unsupportedPart(type: string): Error {
  return new Error(`Pi chat runtime does not support message part: ${type}`);
}

function createPiModel(options: PiChatStreamAdapterOptions): PiModel<'openai-responses'> {
  return {
    api: 'openai-responses',
    baseUrl: options.baseUrl,
    contextWindow: options.contextWindow,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    headers: options.headers,
    id: options.modelId,
    input: ['text'],
    maxTokens: options.maxOutputTokens,
    name: options.modelName,
    provider: options.providerId,
    reasoning: options.supportsReasoning ?? options.thinkingLevel !== 'off',
  };
}

function toUiChunk(event: AssistantMessageEvent): UIMessageChunk | undefined {
  switch (event.type) {
    case 'text_start':
      return { id: `pi-${event.contentIndex}`, type: 'text-start' };
    case 'text_delta':
      return { delta: event.delta, id: `pi-${event.contentIndex}`, type: 'text-delta' };
    case 'text_end': {
      const part = event.partial.content[event.contentIndex];
      const providerMetadata =
        part?.type === 'text' && part.textSignature
          ? piProviderMetadata({ textSignature: part.textSignature })
          : undefined;
      return {
        id: `pi-${event.contentIndex}`,
        ...(providerMetadata ? { providerMetadata } : {}),
        type: 'text-end',
      };
    }
    case 'thinking_start':
      return { id: `pi-${event.contentIndex}`, type: 'reasoning-start' };
    case 'thinking_delta':
      return { delta: event.delta, id: `pi-${event.contentIndex}`, type: 'reasoning-delta' };
    case 'thinking_end': {
      const part = event.partial.content[event.contentIndex];
      const providerMetadata =
        part?.type === 'thinking'
          ? piProviderMetadata({
              ...(typeof part.redacted === 'boolean' ? { redacted: part.redacted } : {}),
              ...(part.thinkingSignature ? { thinkingSignature: part.thinkingSignature } : {}),
            })
          : undefined;
      return {
        id: `pi-${event.contentIndex}`,
        ...(providerMetadata ? { providerMetadata } : {}),
        type: 'reasoning-end',
      };
    }
    default:
      return undefined;
  }
}

function noteTiming(event: AssistantMessageEvent, timing: TimingState): void {
  const now = performance.now();
  if (
    timing.firstTokenAt === undefined &&
    (event.type === 'thinking_delta' || event.type === 'text_delta')
  ) {
    timing.firstTokenAt = now;
  }
  if (event.type === 'thinking_start' && timing.thinkingStartedAt === undefined) {
    timing.thinkingStartedAt = now;
  }
  if (
    timing.thinkingStartedAt !== undefined &&
    timing.thinkingDurationMs === undefined &&
    (event.type === 'text_start' || event.type === 'text_delta')
  ) {
    timing.thinkingDurationMs = Math.max(0, Math.round(now - timing.thinkingStartedAt));
  }
}

function toLanguageModelUsage(usage: PiUsage): LanguageModelUsage {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  const reasoningTokens = usage.reasoning;
  return {
    inputTokenDetails: {
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      noCacheTokens: usage.input,
    },
    inputTokens,
    outputTokenDetails: {
      reasoningTokens,
      textTokens:
        reasoningTokens === undefined ? usage.output : Math.max(0, usage.output - reasoningTokens),
    },
    outputTokens: usage.output,
    totalTokens: usage.totalTokens || inputTokens + usage.output,
  };
}

function toUsageRecord(usage: PiUsage): NonNullable<RecordAiInvocationInput['usage']> {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return {
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    inputTokens,
    noCacheTokens: usage.input,
    outputTokens: usage.output,
    ...(usage.reasoning !== undefined ? { reasoningTokens: usage.reasoning } : {}),
    totalTokens: usage.totalTokens || inputTokens + usage.output,
  };
}

function piMetadata(value: ProviderMetadata | undefined): Record<string, unknown> | undefined {
  return isRecord(value?.pi) ? value.pi : undefined;
}

function piProviderMetadata(value: Record<string, string | boolean>): ProviderMetadata | undefined {
  return Object.keys(value).length > 0 ? ({ pi: value } as ProviderMetadata) : undefined;
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
  return isRecord(message) && message.role === 'assistant';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closeQuietly(controller: ReadableStreamDefaultController<UIMessageChunk>): void {
  try {
    controller.close();
  } catch {
    // The consumer may already have cancelled the stream.
  }
}
