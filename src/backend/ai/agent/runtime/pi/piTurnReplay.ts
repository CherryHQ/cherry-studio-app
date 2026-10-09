import type {
  AssistantMessage,
  JsonObject,
  JsonValue,
  Message,
  ToolResultMessage,
} from '@earendil-works/pi-ai';
import { z } from 'zod';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { parseRuntimeTurnReplay } from '../runtimeTurnReplay';
import type { RuntimeTurnReplay } from '../types';

const logger = loggerService.withContext('PiTurnReplay');

export const PI_TURN_REPLAY_KIND = 'pi-turn-replay-v1';

const TextSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
  textSignature: z.string().optional(),
});
// Tool arguments and result details are JSON by construction (see runtimeTurnReplay) and their
// shape belongs to the tool, so they are not re-validated node by node on every turn.
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
    arguments: z.custom<JsonObject>(
      (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    ),
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
    details: z.custom<JsonValue>().optional(),
    isError: z.boolean(),
    timestamp: z.number(),
  }),
]);
const ReplayPayloadSchema = z.strictObject({
  kind: z.literal(PI_TURN_REPLAY_KIND),
  messages: z.array(ReplayMessageSchema).min(1),
});

type DecodedPayload =
  | { ok: true; replay: RuntimeTurnReplay; payload: z.infer<typeof ReplayPayloadSchema> }
  | { ok: false; reason: string };

function decodePayload(value: unknown): DecodedPayload {
  const replay = parseRuntimeTurnReplay(value);
  if (!replay) return { ok: false, reason: 'invalid envelope' };
  const parsed = ReplayPayloadSchema.safeParse(replay.payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid payload',
    };
  }
  const pending = new Map<string, string>();
  const seen = new Set<string>();
  for (const message of parsed.data.messages) {
    if (message.role === 'assistant') {
      if (pending.size > 0) return { ok: false, reason: 'assistant message before tool results' };
      for (const part of message.content) {
        if (part.type !== 'toolCall') continue;
        if (seen.has(part.id)) return { ok: false, reason: `duplicate tool call ${part.id}` };
        seen.add(part.id);
        pending.set(part.id, part.name);
      }
    } else if (pending.get(message.toolCallId) !== message.toolName) {
      return { ok: false, reason: `unexpected tool result ${message.toolCallId}` };
    } else {
      pending.delete(message.toolCallId);
    }
  }
  return pending.size === 0
    ? { ok: true, replay, payload: parsed.data }
    : { ok: false, reason: 'unanswered tool calls' };
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
      const { role, toolCallId, toolName, content, details, isError, timestamp } = message;
      return { role, toolCallId, toolName, content, details, isError, timestamp };
    }
    return message;
  });
  // Serialization also detaches the artifact from mutable upstream SDK objects.
  let serialized: string;
  try {
    serialized = JSON.stringify({
      version: 1,
      payload: { kind: PI_TURN_REPLAY_KIND, messages: candidates },
    });
  } catch (error) {
    logger.warn('Turn replay dropped: the batch is not serializable', error as Error);
    return undefined;
  }
  const decoded = decodePayload(JSON.parse(serialized));
  if (!decoded.ok) {
    logger.warn('Turn replay dropped: unsupported batch', {
      reason: decoded.reason,
      messages: messages.length,
    });
    return undefined;
  }
  return decoded.replay;
}

export function readPiTurnReplay(
  value: unknown,
): (AssistantMessage | ToolResultMessage)[] | undefined {
  if (value === undefined) return undefined;
  const decoded = decodePayload(value);
  if (!decoded.ok) {
    logger.debug('Stored turn replay ignored; using message history for this turn', {
      reason: decoded.reason,
    });
    return undefined;
  }
  return decoded.payload.messages.map((message) => {
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
