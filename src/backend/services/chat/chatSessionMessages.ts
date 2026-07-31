import { finalizeDanglingToolApprovals } from '@/shared/ai/transport/toolApprovals';
import type { CherryMessagePart, CherryUIMessage, Message } from '@/shared/data/types/message';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

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
