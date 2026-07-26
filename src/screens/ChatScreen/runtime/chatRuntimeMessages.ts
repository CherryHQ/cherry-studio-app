import { finalizeDanglingToolApprovals } from '@/data/services/utils/toolApprovals';
import type { McpToolSource } from '@/data/types/mcpServer';
import type {
  CherryMessagePart,
  CherryUIMessage,
  CherryUIMessageMetadata,
  Message,
  MessageStats,
} from '@/data/types/message';
import { readCherryToolMetadata } from '@/data/types/uiParts';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

/** A tool call the model made that is waiting on the user's decision. */
export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  /** Set for MCP tools only: what the sheet needs to write an auto-approve rule. */
  mcpSource?: McpToolSource;
  messageId: string;
  toolCallId: string;
  toolName: string;
};

export function hasPendingToolApproval(parts: readonly CherryMessagePart[]): boolean {
  return parts.some((part) => isToolPart(part) && part.state === 'approval-requested');
}

/**
 * A decision the resumed stream never acted on. The SDK rewrites a decided part
 * as it runs (or denies) the call, so one still sitting in `approval-responded`
 * when the stream ends cleanly means the tool never reached it — its ToolSet
 * did not contain the tool, which is what a cold tool cache after a restart
 * looks like. The call is left with no result, so the turn has to fail rather
 * than settle.
 */
export function hasUnresumedToolApproval(parts: readonly CherryMessagePart[]): boolean {
  return parts.some((part) => isToolPart(part) && part.state === 'approval-responded');
}

/**
 * Settle every unresolved approval terminally. Used when a turn is torn down
 * instead of resumed (abort, stream error): a waiting part would otherwise
 * re-summon the approval sheet, and either a waiting or an answered-but-
 * unresumed part would leave the model's tool call without a result — which
 * the provider rejects on every later request in that branch.
 */
export function finalizeTurnToolApprovals(
  parts: readonly CherryMessagePart[],
  reason: string,
): CherryMessagePart[] {
  return finalizeDanglingToolApprovals(parts, reason).parts;
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
      const mcpSource = readMcpSource(part);
      approvals.push({
        approvalId: part.approval.id,
        input: part.input,
        ...(mcpSource && { mcpSource }),
        messageId: last.id,
        toolCallId: part.toolCallId,
        toolName: part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length),
      });
    }
  }
  return approvals;
}

function readMcpSource(part: ToolMessagePart): McpToolSource | undefined {
  const tool = readCherryToolMetadata(part)?.tool;
  if (typeof tool?.rawName !== 'string' || typeof tool.serverId !== 'string') {
    return undefined;
  }

  return {
    rawName: tool.rawName,
    serverId: tool.serverId,
    ...(tool.serverName && { serverName: tool.serverName }),
  };
}

/** Everything a resumed segment spends on top of the first one. The durations
 * are listed for when a producer appears — `statsFromMetadata` emits token
 * counts only today — because they measure generation, and the stretch the turn
 * spent waiting on the user belongs to neither segment. */
const additiveStatKeys = [
  'cacheReadTokens',
  'cacheWriteTokens',
  'completionTokens',
  'cost',
  'noCacheTokens',
  'promptTokens',
  'thoughtsTokens',
  'timeCompletionMs',
  'timeThinkingMs',
  'totalTokens',
] as const;

/**
 * Combine stats across a resume boundary. A resumed turn is a brand-new stream
 * whose usage accumulator starts at zero, so overwriting would silently drop
 * what the first segment already paid for.
 */
export function mergeMessageStats(
  prior: MessageStats | null | undefined,
  next: MessageStats | undefined,
): MessageStats | undefined {
  if (!prior) return next;
  if (!next) return prior;

  const merged: MessageStats = { ...prior, ...next };
  for (const key of additiveStatKeys) {
    const a = prior[key];
    const b = next[key];
    if (a !== undefined && b !== undefined) merged[key] = a + b;
  }
  // Time to first token is a property of the turn, not of its last segment.
  if (prior.timeFirstTokenMs !== undefined) {
    merged.timeFirstTokenMs = prior.timeFirstTokenMs;
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
