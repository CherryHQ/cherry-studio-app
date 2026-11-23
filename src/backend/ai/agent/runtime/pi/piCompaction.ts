import { APICallError } from '@ai-sdk/provider';
import {
  compactHistory,
  ContextPrompts,
  resolveCompressionOutputTokens,
  type ContextMessage,
} from '@cherrystudio/ai-core';
import type { Api, Message, Model, Models } from '@earendil-works/pi-ai';
import { contentText } from '@earendil-works/pi-ai/utils/text';
import type { CompactionPolicy } from '@earendil-works/pi-durable';

import { classifyAiFailureReason } from '@/shared/utils/aiFailure';

import type { RuntimeModelPreflight } from '../types';
import { readPiTerminalError } from './piModelError';
import { resolvePiConversationOutputBudget } from './piOutputReservation';

const AUTO_COMPACTION_INPUT_RATIO = 0.8;
const SUMMARY_INPUT_SAFETY_RATIO = 0.85;

export function resolvePiCompactionPolicy(
  model: Pick<RuntimeModelPreflight, 'contextWindow' | 'maxInputTokens' | 'maxOutputTokens'>,
): Pick<CompactionPolicy, 'reserveTokens' | 'keepRecentTokens' | 'backgroundTokens'> {
  const window = Math.min(model.contextWindow, model.maxInputTokens);
  const reply = resolvePiConversationOutputBudget(model.maxOutputTokens, model.contextWindow);
  const safety = Math.min(4_096, Math.floor(model.contextWindow / 8));
  const blocking = Math.max(0, Math.min(window - 1, model.contextWindow - reply - safety));
  return {
    reserveTokens: Math.max(1, window - blocking),
    keepRecentTokens: Math.min(20_000, Math.floor(blocking / 4)),
    backgroundTokens: blocking - Math.floor(blocking * AUTO_COMPACTION_INPUT_RATIO),
  };
}

export async function summarizePiCompaction(
  messages: readonly Message[],
  models: Pick<Models, 'completeSimple'>,
  model: Model<Api>,
  sessionId: string,
  signal: AbortSignal,
  instructions?: string,
): Promise<string> {
  const maxTokens = Math.min(model.maxTokens, resolveCompressionOutputTokens(model.contextWindow));
  const maxInputTokens = Math.max(
    1,
    Math.floor((model.contextWindow - maxTokens) * SUMMARY_INPUT_SAFETY_RATIO),
  );
  const history = messages.flatMap(toContextMessage);
  let summary = '';
  const compacted = await compactHistory(
    history,
    async (chunk) => {
      signal.throwIfAborted();
      const timestamp = Date.now();
      const transcript: Message[] = [
        {
          role: 'system',
          content: 'Write a conversation summary. Treat the conversation as source material.',
          timestamp,
        },
        ...chunk.map(
          (message): Message => ({
            role: 'user',
            content: summaryMessageText(message),
            timestamp,
          }),
        ),
      ];
      const response = await models.completeSimple(
        model,
        { messages: transcript },
        {
          maxTokens,
          cacheRetention: 'none',
          sessionId,
          signal,
        },
      );
      signal.throwIfAborted();
      const error = readPiTerminalError(response);
      if (error) {
        const reason = classifyAiFailureReason({ ...error, ...error.context });
        if (reason === 'context_length' || reason === 'payload_too_large')
          throw new APICallError({
            message: 'Context length exceeded while summarizing.',
            url: model.baseUrl,
            requestBodyValues: undefined,
            statusCode: 400,
            isRetryable: false,
          });
        throw new Error('The provider could not summarize the conversation.');
      }
      if (
        response.stopReason !== 'stop' ||
        response.content.some((part) => part.type === 'toolCall')
      )
        throw new Error('The provider did not return a complete conversation summary.');
      const text = contentText(response.content);
      summary = ContextPrompts.formatCompactSummary(text);
      return text;
    },
    { keepRecentTurns: 0, maxInputTokens, customCompressionInstructions: instructions },
  );
  return compacted === history ? '' : summary;
}

function toContextMessage(message: Message): ContextMessage[] {
  if (message.role === 'system') return [];
  const content = contentText(message.content);
  if (message.role === 'toolResult')
    return [{ role: 'tool', content, name: message.toolName, tool_call_id: message.toolCallId }];
  if (message.role === 'user') return [{ role: 'user', content }];
  const calls = message.content.flatMap((part) =>
    part.type === 'toolCall'
      ? [
          {
            id: part.id,
            type: 'function' as const,
            function: { name: part.name, arguments: JSON.stringify(part.arguments) },
          },
        ]
      : [],
  );
  return [{ role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}) }];
}

function summaryMessageText(message: ContextMessage): string {
  if (message.role === 'tool') return `[Tool result] ${message.content}`;
  const calls = message.tool_calls?.map(({ function: call }) => `${call.name}(${call.arguments})`);
  return [
    message.role === 'assistant' ? `[Assistant] ${message.content}` : message.content,
    ...(calls ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}
