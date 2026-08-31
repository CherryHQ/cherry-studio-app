import type {
  AgentErrorView,
  AgentExecutionTarget,
  AgentInferenceSnapshotV1,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
  AgentUsageView,
} from '@/shared/contracts/agent';

import type { RuntimeContextCheckpoint } from '../runtime';

export type StoredRuntimeContextCheckpoint = {
  assistantMessageId: string;
  checkpoint: unknown;
};

export type StoredRuntimeTurnContext = {
  /** False only when an `afterTurnId` was requested but is not in this Session. */
  anchorFound: boolean;
  /** Model-visible history: full transcript or only rows after the requested turn. */
  history: AgentMessageView[];
  /** Distinguishes a truly empty Session from a checkpoint-trimmed history tail. */
  hasMessages: boolean;
  /** Lightweight authorization projection across the complete transcript. */
  referencedFileEntryIds: string[];
  /** Lightweight checkpoint-anchor projection across the complete transcript. */
  sessionTurnIds: string[];
};

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

export type ReserveInitialSubmissionInput = Omit<ReserveSubmissionInput, 'sessionId'> & {
  agentId: string;
  executionTarget: AgentExecutionTarget;
};

export type ReserveInitialSubmissionResult = ReserveSubmissionResult & {
  session: AgentSessionView;
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
  /** Saved only on a successfully completed assistant row. */
  contextCheckpoint: RuntimeContextCheckpoint | null;
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

  /** Atomically creates a Session and reserves its first user/assistant message pair. */
  reserveInitialSubmission(
    input: ReserveInitialSubmissionInput,
  ): Promise<ReserveInitialSubmissionResult>;

  /**
   * Atomically reserves the user message and assistant placeholder under a
   * fresh shared turnId before execution starts (protocol invariant 2).
   */
  reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult>;

  listMessages(sessionId: string): Promise<AgentMessageView[]>;

  /**
   * Loads the bounded Runtime replay tail plus full-transcript authorization
   * indexes without materializing every message in the Host.
   */
  loadRuntimeTurnContext(
    sessionId: string,
    afterTurnId: string | null,
  ): Promise<StoredRuntimeTurnContext>;

  /** Returns the newest assistant row carrying an opaque checkpoint candidate. */
  getLatestContextCheckpoint(sessionId: string): Promise<StoredRuntimeContextCheckpoint | null>;

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
