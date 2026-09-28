import type { AssistantMessage, Message, ToolResultMessage } from '@earendil-works/pi-ai';
import { z } from 'zod';

import { RuntimeJsonValueSchema } from '../runtimeSchemas';
import { parseRuntimeTurnReplay } from '../runtimeTurnReplay';
import type { RuntimeTurnReplay } from '../types';

export const PI_TURN_REPLAY_KIND = 'pi-turn-replay-v1';

const TextSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
  textSignature: z.string().optional(),
});
const AssistantContentSchema = z.discriminatedUnion('type', [
  TextSchema,
  z.strictObject({
    type: z.literal('thinking'),
    thinking: z.string(),
    thinkingSignature: z.string().optional(),
    redacted: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('toolCall'),
    id: z.string().min(1),
    name: z.string().min(1),
    arguments: z.record(z.string(), RuntimeJsonValueSchema),
    thoughtSignature: z.string().optional(),
    namespace: z.string().optional(),
  }),
]);

// Model history and origin identity, excluding provider diagnostics, transport credentials and billing.
const ReplayMessageSchema = z.discriminatedUnion('role', [
  z.strictObject({
    role: z.literal('assistant'),
    content: z.array(AssistantContentSchema),
    api: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    responseId: z.string().optional(),
    responseModel: z.string().optional(),
    stopReason: z.enum(['stop', 'length', 'toolUse']),
    timestamp: z.number(),
  }),
  z.strictObject({
    role: z.literal('toolResult'),
    toolCallId: z.string().min(1),
    toolName: z.string(),
    // Mobile tools return text. Unsupported future media use the existing managed-file path.
    content: z.array(TextSchema),
    details: RuntimeJsonValueSchema.optional(),
    addedToolNames: z.array(z.string()).optional(),
    isError: z.boolean(),
    timestamp: z.number(),
  }),
]);
const ReplayPayloadSchema = z.strictObject({
  kind: z.literal(PI_TURN_REPLAY_KIND),
  messages: z.array(ReplayMessageSchema).min(1),
});

function readPayload(value: unknown) {
  const replay = parseRuntimeTurnReplay(value);
  if (!replay) return undefined;
  const parsed = ReplayPayloadSchema.safeParse(replay.payload);
  if (!parsed.success) return undefined;
  const pending = new Map<string, string>();
  const seen = new Set<string>();
  for (const message of parsed.data.messages) {
    if (message.role === 'assistant') {
      if (pending.size > 0) return undefined;
      for (const part of message.content) {
        if (part.type !== 'toolCall') continue;
        if (seen.has(part.id)) return undefined;
        seen.add(part.id);
        pending.set(part.id, part.name);
      }
    } else {
      if (pending.get(message.toolCallId) !== message.toolName) return undefined;
      pending.delete(message.toolCallId);
    }
  }
  return pending.size === 0 ? { replay, payload: parsed.data } : undefined;
}

/** One complete turn, never an accumulated session or a user attachment payload. */
export function createPiTurnReplay(messages: readonly Message[]): RuntimeTurnReplay | undefined {
  const candidates = messages.map((message) => {
    if (message.role === 'assistant') {
      const {
        role,
        content,
        api,
        provider,
        model,
        responseId,
        responseModel,
        stopReason,
        timestamp,
      } = message;
      return {
        role,
        content,
        api,
        provider,
        model,
        responseId,
        responseModel,
        stopReason,
        timestamp,
      };
    }
    if (message.role === 'toolResult') {
      const { role, toolCallId, toolName, content, details, addedToolNames, isError, timestamp } =
        message;
      return { role, toolCallId, toolName, content, details, addedToolNames, isError, timestamp };
    }
    return message;
  });
  // Serialization also detaches the artifact from mutable upstream SDK objects.
  try {
    const candidate: unknown = JSON.parse(
      JSON.stringify({
        version: 1,
        payload: { kind: PI_TURN_REPLAY_KIND, messages: candidates },
      }),
    );
    return readPayload(candidate)?.replay;
  } catch {
    return undefined;
  }
}

export function readPiTurnReplay(
  value: unknown,
): (AssistantMessage | ToolResultMessage)[] | undefined {
  const decoded = readPayload(value);
  return decoded?.payload.messages.map((message) => {
    if (message.role === 'toolResult') return message;
    return {
      ...message,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
  });
}
