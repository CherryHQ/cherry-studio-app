/**
 * Tool-approval part transforms (desktop `applyApprovalDecisions` equivalent).
 *
 * A tool part in `approval-requested` state carries `approval: { id }`; the
 * user's decision flips it to `approval-responded` with `approved`/`reason`.
 * `convertToModelMessages` then turns the responded part into the
 * `tool-approval-response` model message the next stream run consumes.
 */

import type { CherryMessagePart } from '@/data/types/message';

export type ToolApprovalDecision = {
  approvalId: string;
  approved: boolean;
  reason?: string;
};

export type ToolApprovalInput =
  | { decisions: ToolApprovalDecision[] }
  | { denyAll: { reason: string } };

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

export function countPendingToolApprovals(parts: readonly CherryMessagePart[]): number {
  return parts.filter((part) => isToolPart(part) && part.state === 'approval-requested').length;
}

/**
 * Apply approval decisions to a parts array.
 *
 * Returns the transformed parts, how many decisions matched a pending part,
 * and how many approvals are still pending afterwards. Callers own the "did
 * every decision land" check — a decision that matches nothing usually means
 * a double submit.
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

    if ('denyAll' in input) {
      matchedCount += 1;
      return respondedPart(part, part.approval.id, false, input.denyAll.reason);
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
