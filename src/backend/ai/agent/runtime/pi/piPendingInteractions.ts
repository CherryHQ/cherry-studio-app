import { defineDoc, defineSignal, type LiveState, type TaskId } from '@earendil-works/pi-durable';
import { z } from 'zod';

import type { RuntimePendingApproval, RuntimePendingQuestion } from '../durableTypes';

export const ToolApprovalDecisionSchema = z.strictObject({
  decision: z.enum(['approve', 'deny']),
  executionSettingsKey: z.string().optional(),
});

export const ToolApprovalSignal = defineSignal({
  name: 'cherry.tool-approval',
  version: 1,
  schema: z.toJSONSchema(ToolApprovalDecisionSchema),
});

export const UserQuestionAnswerSignal = defineSignal({
  name: 'cherry.user-question-answer',
  version: 1,
  schema: { type: 'object', additionalProperties: true } as Record<string, unknown>,
});

type PendingTask = { taskId: number; key: string };
export type StoredPendingApproval = Omit<RuntimePendingApproval, 'id'> &
  PendingTask & { executionSettingsKey?: string };
export type StoredPendingQuestion = RuntimePendingQuestion & PendingTask;

export const PiPendingApprovalsDoc = defineDoc<{ items: Record<string, StoredPendingApproval> }>({
  kind: 'cherry.pending-approvals',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  checkpointWhen: () => true,
  initial: () => ({ items: {} }),
});

export const PiPendingQuestionsDoc = defineDoc<{ items: Record<string, StoredPendingQuestion> }>({
  kind: 'cherry.pending-questions',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  checkpointWhen: () => true,
  initial: () => ({ items: {} }),
});

/** Original wall-clock timeout deadline of a Code Mode script. */
export const PiCodemodeDeadlineDoc = defineDoc<{ deadline?: number }>({
  kind: 'cherry.codemode-deadline',
  version: 1,
  scope: 'task',
  checkpointWhen: () => false,
  initial: () => ({}),
});

export type StoredToolGate = {
  bound?: boolean;
  blocked?: boolean;
  responded?: boolean;
  discoveryRetryCount?: number;
  executionSettingsKey?: string;
  approval?: 'auto' | 'ask' | 'deny';
  requiresApproval?: boolean;
  effect?: 'read' | 'write';
};

/** Durable offered-gate binding for a ToolTask; survives crashes until the task settles. */
export const PiToolGateDoc = defineDoc<StoredToolGate>({
  kind: 'cherry.tool-gate',
  version: 1,
  scope: 'task',
  checkpointWhen: () => true,
  initial: () => ({}),
});

export function hasCommittedTaskSignal(
  task: { readonly memos?: Readonly<Record<string, unknown>> } | undefined,
  signalName: string,
  key: string,
): boolean {
  return Boolean(task?.memos && Object.hasOwn(task.memos, `pi.signal.${signalName}/${key}`));
}

export function hasLiveTool(
  live: Readonly<LiveState>,
  toolCallId: string,
  taskId: number,
): boolean {
  const isActive = (tool: { callId: string; taskId?: TaskId; status: string }) =>
    tool.callId === toolCallId && Number(tool.taskId) === taskId && tool.status !== 'done';
  return !!(live.tools?.some(isActive) || live.nestedTools?.some(isActive));
}

/** Drop persisted interactions whose owning task is no longer active in `pi.live`. */
export function pruneStaleInteractions<T extends { taskId: number; toolCallId: string }>(
  items: Record<string, T>,
  live: Readonly<LiveState>,
): void {
  for (const [id, item] of Object.entries(items)) {
    if (!hasLiveTool(live, item.toolCallId, item.taskId)) delete items[id];
  }
}
