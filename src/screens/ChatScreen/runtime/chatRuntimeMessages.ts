import { applyToolApprovalDecisionsToParts } from '@/data/services/utils/toolApprovals';
import type {
  CherryMessagePart,
  CherryUIMessage,
  CherryUIMessageMetadata,
  Message,
  MessageStats,
} from '@/data/types/message';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

/** A tool call the model made that is waiting on the user's decision. */
export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  messageId: string;
  toolCallId: string;
  toolName: string;
};

export function hasPendingToolApproval(parts: readonly CherryMessagePart[]): boolean {
  return parts.some((part) => isToolPart(part) && part.state === 'approval-requested');
}

/**
 * Close out every pending approval as denied. Used when the turn is torn down
 * (abort) — a dangling `approval-requested` part would otherwise re-summon the
 * approval sheet and leave the model's tool call unclosable.
 */
export function denyPendingToolApprovals(
  parts: readonly CherryMessagePart[],
  reason: string,
): CherryMessagePart[] {
  return applyToolApprovalDecisionsToParts(parts, { denyAll: { reason } }).parts;
}

/**
 * Pending approvals for the approval sheet. Only the tip assistant message in
 * `paused` state can carry them: streaming overlays force `pending`, so this
 * never fires mid-stream, and terminal `paused` rows survive restarts — which
 * is what makes the sheet reappear after a kill.
 */
export function getPendingToolApprovals(messages: readonly Message[]): PendingToolApproval[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant' || last.status !== 'paused') {
    return [];
  }

  const approvals: PendingToolApproval[] = [];
  for (const part of last.data.parts ?? []) {
    if (isToolPart(part) && part.state === 'approval-requested') {
      approvals.push({
        approvalId: part.approval.id,
        input: part.input,
        messageId: last.id,
        toolCallId: part.toolCallId,
        toolName: part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length),
      });
    }
  }
  return approvals;
}

/**
 * Combine stats across a resume boundary. A resumed turn is a brand-new stream
 * whose usage accumulator starts at zero, so overwriting would silently drop
 * the tokens the first segment already paid for. Counters add up; timings keep
 * the latest segment's values (summing wall-clock times across segments that
 * may be minutes apart means nothing).
 */
export function mergeMessageStats(
  prior: MessageStats | null | undefined,
  next: MessageStats | undefined,
): MessageStats | undefined {
  if (!prior) return next;
  if (!next) return prior;

  const merged: MessageStats = { ...prior, ...next };
  for (const key of [
    'cacheReadTokens',
    'cacheWriteTokens',
    'completionTokens',
    'cost',
    'noCacheTokens',
    'promptTokens',
    'thoughtsTokens',
    'totalTokens',
  ] as const) {
    const a = prior[key];
    const b = next[key];
    if (a !== undefined && b !== undefined) merged[key] = a + b;
  }
  return merged;
}

/** Token counts come from `metadata`, populated by `Agent.stream`'s
 * per-step usage accumulator via `message-metadata` chunks. */
export function statsFromMetadata(
  metadata: CherryUIMessageMetadata | undefined,
): MessageStats | undefined {
  if (!metadata) return undefined;

  const stats: MessageStats = {};
  if (typeof metadata.totalTokens === 'number') stats.totalTokens = metadata.totalTokens;
  if (typeof metadata.promptTokens === 'number') stats.promptTokens = metadata.promptTokens;
  if (typeof metadata.completionTokens === 'number')
    stats.completionTokens = metadata.completionTokens;
  if (typeof metadata.thoughtsTokens === 'number') stats.thoughtsTokens = metadata.thoughtsTokens;

  return Object.keys(stats).length > 0 ? stats : undefined;
}

export function applyStreamingMessage(baseMessage: Message, uiMessage: CherryUIMessage): Message {
  return {
    ...baseMessage,
    data: {
      ...baseMessage.data,
      parts: uiMessage.parts as CherryMessagePart[],
    },
    status: 'pending',
    updatedAt: new Date().toISOString(),
  };
}

export function mergeMessagesWithOverlay(
  messages: readonly Message[],
  overlayMessage?: Message,
): readonly Message[] {
  if (!overlayMessage) {
    return messages;
  }

  let didReplace = false;
  const nextMessages = messages.map((message) => {
    if (message.id !== overlayMessage.id) {
      return message;
    }

    didReplace = true;
    return overlayMessage;
  });

  return didReplace ? nextMessages : [...nextMessages, overlayMessage];
}
