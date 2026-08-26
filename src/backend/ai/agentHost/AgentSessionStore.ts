import type {
  AgentErrorView,
  AgentInferenceSnapshotV1,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
  AgentUsageView,
} from '@/shared/contracts/agent';

export type ReserveSubmissionResult = {
  /** Fresh correlation id shared by the reserved user/assistant pair. */
  turnId: string;
  userMessage: AgentMessageView;
  assistantMessage: AgentMessageView;
};

export type ReserveSubmissionInput = {
  sessionId: string;
  userParts: AgentMessagePart[];
  modelId: AgentInferenceSnapshotV1['model']['uniqueModelId'];
  inferenceSnapshot: AgentInferenceSnapshotV1;
};

export type FinalizeAssistantMessageInput = {
  assistantMessageId: string;
  status: 'success' | 'error' | 'cancelled' | 'interrupted';
  parts: AgentMessagePart[];
  usage: AgentUsageView | null;
  /**
   * Turn-level error, persisted beside the message for the Turn projection
   * (agent-persistence.md). It is not part of the message view.
   */
  error: AgentErrorView | null;
};

/**
 * Host-owned storage port for Agent Sessions and their linear transcripts
 * (docs/references/agent/agent-persistence.md).
 *
 * The store persists messages only. The Turn is a Host projection: live turn
 * state (`running`/`awaiting-approval`/`cancelling`) and pending approvals are
 * process-local Host state by design, and terminal turn facts live on the
 * assistant message row. Multi-record operations are atomic at this boundary.
 */
export interface AgentSessionStore {
  createSession(input: { agentId: string; title?: string }): Promise<AgentSessionView>;
  getSession(sessionId: string): Promise<AgentSessionView | null>;
  renameSession(sessionId: string, title: string): Promise<AgentSessionView | null>;
  /** Renames only when the current title still matches the caller's auto-title snapshot. */
  autoRenameSession(
    sessionId: string,
    expectedTitle: string,
    title: string,
  ): Promise<AgentSessionView | null>;
  /** Deletes the Session's messages with it. */
  deleteSession(sessionId: string): Promise<boolean>;

  /**
   * Atomically reserves the user message and assistant placeholder under a
   * fresh shared turnId before execution starts (protocol invariant 2).
   */
  reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult>;

  listMessages(sessionId: string): Promise<AgentMessageView[]>;

  /**
   * Atomically settles the assistant message's terminal state before terminal
   * events publish (protocol invariant 5).
   */
  finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView>;

  /**
   * Marks every unsettled message interrupted and stamps the turn-level error.
   * Returns the number of reconciled assistant placeholders.
   */
  reconcileInterrupted(error: AgentErrorView): Promise<number>;
}
