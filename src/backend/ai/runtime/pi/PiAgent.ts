import { mergeUsage, ZERO_USAGE } from '@cherrystudio/ai-runtime/runtime';
import { Agent as PiCoreAgent, type AgentEvent, type StreamFn } from '@mariozechner/pi-agent-core';
import type {
  AssistantMessage,
  Message as PiMessage,
  Model as PiModel,
  Usage as PiUsage,
} from '@mariozechner/pi-ai';
import { streamSimpleOpenAIResponses } from '@mariozechner/pi-ai/openai-responses';
import type { LanguageModelUsage, ModelMessage, UIMessageChunk } from 'ai';

import type { PiAgentExperimentConfig } from '@/shared/config/piAgentExperiment';

const LUNA_CONTEXT_WINDOW = 372_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

export interface PiAgentOptions {
  maxOutputTokens?: number;
  sessionId?: string;
  system?: string;
}

export interface PiAgentRunResult {
  finishReason: 'error' | 'length' | 'stop' | 'tool-calls' | 'other';
  text: string;
  usage: LanguageModelUsage;
}

type PiAgentChunk = Exclude<
  UIMessageChunk,
  { type: 'abort' | 'finish' | 'message-metadata' | 'start' }
>;

export class PiAgent {
  constructor(
    private readonly config: PiAgentExperimentConfig,
    private readonly options: PiAgentOptions = {},
  ) {}

  async run(
    input: { messages: ModelMessage[] } | { prompt: string },
    signal?: AbortSignal,
    onChunk?: (chunk: PiAgentChunk) => void,
  ): Promise<PiAgentRunResult> {
    signal?.throwIfAborted();

    const messages =
      'prompt' in input
        ? [{ role: 'user', content: input.prompt, timestamp: Date.now() } satisfies PiMessage]
        : toPiMessages(input.messages);
    const promptIndex = findLastUserMessageIndex(messages);
    if (promptIndex < 0) throw new Error('Pi agent requires a user message');

    const promptMessages = messages.slice(promptIndex);
    const model = createLunaModel(this.config, this.options.maxOutputTokens);
    const agent = new PiCoreAgent({
      getApiKey: () => this.config.apiKey,
      initialState: {
        messages: messages.slice(0, promptIndex),
        model,
        systemPrompt: this.options.system ?? '',
        thinkingLevel: 'medium',
      },
      sessionId: this.options.sessionId,
      streamFn: streamSimpleOpenAIResponses as StreamFn,
    });

    let assistantMessage: AssistantMessage | undefined;
    let usage = ZERO_USAGE;
    const unsubscribe = agent.subscribe((event) => {
      if (event.type === 'message_update') {
        const chunk = toUiChunk(event);
        if (chunk) onChunk?.(chunk);
      }
      if (event.type === 'turn_end' && isAssistantMessage(event.message)) {
        assistantMessage = event.message;
        usage = mergeUsage(usage, toLanguageModelUsage(event.message.usage));
      }
    });
    const abort = () => agent.abort();
    signal?.addEventListener('abort', abort, { once: true });

    try {
      await agent.prompt(promptMessages);
      signal?.throwIfAborted();
      if (!assistantMessage) throw new Error('Pi agent completed without an assistant response');
      if (assistantMessage.stopReason === 'error') {
        throw new Error(assistantMessage.errorMessage ?? 'Pi agent request failed');
      }

      return {
        finishReason: mapFinishReason(assistantMessage.stopReason),
        text: assistantMessage.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join(''),
        usage,
      };
    } finally {
      signal?.removeEventListener('abort', abort);
      unsubscribe();
    }
  }
}

function createLunaModel(
  config: PiAgentExperimentConfig,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
): PiModel<'openai-responses'> {
  return {
    api: 'openai-responses',
    baseUrl: normalizeOpenAIBaseUrl(config.baseUrl),
    contextWindow: LUNA_CONTEXT_WINDOW,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id: config.modelId,
    input: ['text'],
    maxTokens: maxOutputTokens,
    name: 'GPT-5.6 Luna',
    provider: config.providerName,
    reasoning: true,
  };
}

function normalizeOpenAIBaseUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/v1`;
}

function findLastUserMessageIndex(messages: PiMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}

function toPiMessages(messages: ModelMessage[]): PiMessage[] {
  return messages.flatMap((message): PiMessage[] => {
    if (message.role === 'system' || message.role === 'tool') return [];

    const text = extractText(message.content);
    if (!text) return [];
    if (message.role === 'user') {
      return [{ content: text, role: 'user', timestamp: Date.now() }];
    }

    return [
      {
        api: 'openai-responses',
        content: [{ text, type: 'text' }],
        model: 'history',
        provider: 'cherry-studio',
        role: 'assistant',
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: emptyPiUsage(),
      },
    ];
  });
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .flatMap((part) => {
      if (!isRecord(part)) return [];
      if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string') {
        return [part.text];
      }
      return [];
    })
    .join('');
}

function toUiChunk(
  event: Extract<AgentEvent, { type: 'message_update' }>,
): PiAgentChunk | undefined {
  const update = event.assistantMessageEvent;
  switch (update.type) {
    case 'text_start':
      return { id: `pi-${update.contentIndex}`, type: 'text-start' };
    case 'text_delta':
      return { delta: update.delta, id: `pi-${update.contentIndex}`, type: 'text-delta' };
    case 'text_end':
      return { id: `pi-${update.contentIndex}`, type: 'text-end' };
    case 'thinking_start':
      return { id: `pi-${update.contentIndex}`, type: 'reasoning-start' };
    case 'thinking_delta':
      return { delta: update.delta, id: `pi-${update.contentIndex}`, type: 'reasoning-delta' };
    case 'thinking_end':
      return { id: `pi-${update.contentIndex}`, type: 'reasoning-end' };
    default:
      return undefined;
  }
}

function toLanguageModelUsage(usage: PiUsage): LanguageModelUsage {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return {
    inputTokenDetails: {
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      noCacheTokens: usage.input,
    },
    inputTokens,
    outputTokenDetails: {
      reasoningTokens: undefined,
      textTokens: usage.output,
    },
    outputTokens: usage.output,
    totalTokens: usage.totalTokens || inputTokens + usage.output,
  };
}

function emptyPiUsage(): PiUsage {
  return {
    cacheRead: 0,
    cacheWrite: 0,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
    input: 0,
    output: 0,
    totalTokens: 0,
  };
}

function mapFinishReason(reason: AssistantMessage['stopReason']): PiAgentRunResult['finishReason'] {
  switch (reason) {
    case 'length':
      return 'length';
    case 'error':
      return 'error';
    case 'toolUse':
      return 'tool-calls';
    case 'stop':
      return 'stop';
    default:
      return 'other';
  }
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
  return isRecord(message) && message.role === 'assistant';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
