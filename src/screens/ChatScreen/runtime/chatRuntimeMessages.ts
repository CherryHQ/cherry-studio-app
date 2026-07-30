import { finalizeDanglingToolApprovals } from '@/data/services/utils/toolApprovals';
import type { CherryMessagePart, CherryUIMessage, Message } from '@/data/types/message';
import { readCherryToolMetadata } from '@/data/types/uiParts';

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
  toolType?: 'builtin' | 'mcp' | 'provider';
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
 * Pending approvals for the approval sheet. Only the tip assistant message is
 * actionable; its persisted status is deliberately irrelevant so current
 * `success` rows and legacy `paused` rows both recover after a restart.
 */
export function getPendingToolApprovals(messages: readonly Message[]): PendingToolApproval[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') {
    return [];
  }

  const approvals: PendingToolApproval[] = [];
  for (const part of last.data.parts ?? []) {
    if (isToolPart(part) && part.state === 'approval-requested') {
      const toolType = readCherryToolMetadata(part)?.tool?.type;
      approvals.push({
        approvalId: part.approval.id,
        input: part.input,
        messageId: last.id,
        toolCallId: part.toolCallId,
        toolName: part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length),
        ...(toolType && { toolType }),
      });
    }
  }
  return approvals;
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
