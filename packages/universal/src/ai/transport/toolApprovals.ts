/**
 * Tool-approval part transforms (desktop `applyApprovalDecisions` equivalent).
 *
 * A tool part in `approval-requested` state carries `approval: { id }`; the
 * user's decision flips it to `approval-responded` with `approved`/`reason`.
 * `convertToModelMessages` then turns the responded part into the
 * `tool-approval-response` model message the next stream run consumes.
 *
 * `approval-responded` is a transient state while the message is collecting
 * decisions or about to resume. Once the final request is answered, it must
 * not become the message's terminal state:
 * `convertToModelMessages` emits a tool result for `output-available`,
 * `output-error` and `output-denied` only, so a responded part leaves a tool
 * call with no result behind. The SDK's own guard misses it — it exempts
 * every approval-responded call from `MissingToolResultsError` without
 * looking at `approved` — so the provider is the first to notice, and answers
 * 400 for that branch from then on. Any path that abandons a turn instead of
 * resuming it must call `finalizeDanglingToolApprovals`.
 */

import type { CherryMessagePart } from '@shared/data/types/message';
import { withCherryMeta } from '@shared/data/types/uiParts';

export type ApprovalDecision = {
  approvalId: string;
  approved: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
};

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function respondedPart(part: ToolMessagePart, decision: ApprovalDecision): CherryMessagePart {
  return {
    ...part,
    ...(decision.updatedInput !== undefined ? { input: decision.updatedInput } : {}),
    approval: {
      approved: decision.approved,
      id: decision.approvalId,
      ...(decision.reason !== undefined && { reason: decision.reason }),
    },
    state: 'approval-responded',
  } as CherryMessagePart;
}

/** Terminal deny — the SDK renders it as an error-text tool result. */
function deniedPart(part: ToolMessagePart, approvalId: string, reason: string): CherryMessagePart {
  return {
    ...part,
    approval: { approved: false, id: approvalId, reason },
    state: 'output-denied',
  } as CherryMessagePart;
}

/**
 * Flag a part the app closed out itself. Its terminal state and reason are
 * written for the model; the UI reads this to keep from reporting a decision
 * the user never made.
 */
function markSettledByApp(part: CherryMessagePart): CherryMessagePart {
  return withCherryMeta(part as ToolMessagePart, { settledByApp: true });
}

/**
 * Terminal error for a tool that was approved but never reported an output.
 * The tool may well have run, so the text says the result was lost rather
 * than that nothing happened.
 */
function unfinishedPart(
  part: ToolMessagePart,
  approvalId: string,
  errorText: string,
): CherryMessagePart {
  return {
    ...part,
    approval: { approved: true, id: approvalId },
    errorText,
    state: 'output-error',
  } as CherryMessagePart;
}

export function countPendingToolApprovals(parts: readonly CherryMessagePart[]): number {
  return parts.filter((part) => isToolPart(part) && part.state === 'approval-requested').length;
}

/**
 * Close out every approval that is still waiting, or answered but never
 * resumed, so the message can be persisted terminally without leaving the
 * model's tool call unanswered. `reason` is fed to the model as the tool
 * result, so it describes what happened to the turn — an explicit denial
 * reason already on the part wins over it.
 */
export function finalizeDanglingToolApprovals(
  parts: readonly CherryMessagePart[],
  reason: string,
): { matchedCount: number; parts: CherryMessagePart[] } {
  let matchedCount = 0;

  const nextParts = parts.map((part): CherryMessagePart => {
    if (!isToolPart(part)) {
      return part;
    }

    if (part.state === 'approval-requested') {
      matchedCount += 1;
      return markSettledByApp(deniedPart(part, part.approval.id, reason));
    }

    if (part.state === 'approval-responded') {
      matchedCount += 1;
      // A denial the user did make keeps its own reason, and stays their
      // decision — only the ones nobody answered are marked as the app's.
      return part.approval.approved
        ? markSettledByApp(unfinishedPart(part, part.approval.id, reason))
        : deniedPart(part, part.approval.id, part.approval.reason ?? reason);
    }

    return part;
  });

  return { matchedCount, parts: nextParts };
}

/**
 * Apply approval decisions to a parts array.
 *
 * Decisions leave parts in `approval-responded`. Once no request remains, the
 * caller must resume the turn; a caller that abandons it instead wants
 * `finalizeDanglingToolApprovals`.
 */
export function applyToolApprovalDecisionsToParts(
  parts: readonly CherryMessagePart[],
  decisions: readonly ApprovalDecision[],
): CherryMessagePart[] {
  if (decisions.length === 0) {
    return [...parts];
  }

  const byApprovalId = new Map(decisions.map((decision) => [decision.approvalId, decision]));

  return parts.map((part): CherryMessagePart => {
    if (!isToolPart(part) || part.state !== 'approval-requested') {
      return part;
    }

    const decision = byApprovalId.get(part.approval.id);
    if (!decision) {
      return part;
    }
    return respondedPart(part, decision);
  });
}
