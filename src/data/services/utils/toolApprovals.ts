/**
 * Tool-approval part transforms (desktop `applyApprovalDecisions` equivalent).
 *
 * A tool part in `approval-requested` state carries `approval: { id }`; the
 * user's decision flips it to `approval-responded` with `approved`/`reason`.
 * `convertToModelMessages` then turns the responded part into the
 * `tool-approval-response` model message the next stream run consumes.
 *
 * `approval-responded` is only ever a *transient* state, valid while the turn
 * is about to resume. It must never be a message's terminal state:
 * `convertToModelMessages` emits a tool result for `output-available`,
 * `output-error` and `output-denied` only, so a responded part leaves a tool
 * call with no result behind. The SDK's own guard misses it — it exempts
 * every approval-responded call from `MissingToolResultsError` without
 * looking at `approved` — so the provider is the first to notice, and answers
 * 400 for that branch from then on. Any path that abandons a turn instead of
 * resuming it must call `finalizeDanglingToolApprovals`.
 */

import type { CherryMessagePart } from '@/data/types/message';
import { withCherryMeta } from '@/data/types/uiParts';

export type ToolApprovalDecision = {
  approvalId: string;
  approved: boolean;
  reason?: string;
};

export type ToolApprovalInput = { decisions: ToolApprovalDecision[] };

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function respondedPart(
  part: ToolMessagePart,
  approvalId: string,
  approved: boolean,
  reason: string | undefined,
): CherryMessagePart {
  return {
    ...part,
    approval: { approved, id: approvalId, ...(reason !== undefined && { reason }) },
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
 * Returns the transformed parts, how many decisions matched a pending part,
 * and how many approvals are still pending afterwards. Callers own the "did
 * every decision land" check — a decision that matches nothing usually means
 * a double submit.
 *
 * Decisions leave parts in the transient `approval-responded` state, so this is
 * only correct when the caller resumes the turn right after. A caller that
 * abandons the turn instead wants `finalizeDanglingToolApprovals`.
 */
export function applyToolApprovalDecisionsToParts(
  parts: readonly CherryMessagePart[],
  input: ToolApprovalInput,
): { matchedCount: number; parts: CherryMessagePart[]; pendingApprovalCount: number } {
  let matchedCount = 0;

  const nextParts = parts.map((part): CherryMessagePart => {
    if (!isToolPart(part) || part.state !== 'approval-requested') {
      return part;
    }

    const decision = input.decisions.find((d) => d.approvalId === part.approval.id);
    if (!decision) {
      return part;
    }
    matchedCount += 1;
    return respondedPart(part, decision.approvalId, decision.approved, decision.reason);
  });

  return {
    matchedCount,
    parts: nextParts,
    pendingApprovalCount: countPendingToolApprovals(nextParts),
  };
}
