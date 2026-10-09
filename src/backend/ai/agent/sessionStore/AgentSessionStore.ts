import type {
  AgentErrorView,
  AgentInferenceSnapshotV1,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
} from '@/shared/contracts/agent';
import type {
  MessageRuntimeStatsInput,
  MessageRuntimeTiming,
  MessageStats,
} from '@/shared/data/types/message';

import type { RuntimeContextCheckpoint, RuntimeTurnReplay } from '../runtime';

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
  userMessageId: string;
  assistantMessageId: string;
  userParts: AgentMessagePart[];
  modelId: AgentInferenceSnapshotV1['model']['uniqueModelId'];
  inferenceSnapshot: AgentInferenceSnapshotV1;
};

export type ReserveInitialSubmissionInput = ReserveSubmissionInput & {
  agentId: string;
};

export type ReserveInitialSubmissionResult = ReserveSubmissionResult & {
  session: AgentSessionView;
};

export type ReserveRetryInput = ReserveSubmissionInput & {
  /** Recorded prefix the replacement execution keeps; empty restarts the answer. */
  assistantParts: AgentMessagePart[];
};

export type ForkSessionInput = {
  sessionId: string;
  /** Inclusive fork point, identified by message rather than by turn. */
  fromMessageId: string;
  /** Overrides the copied source name; the store never composes one itself. */
  name?: string;
};

/** Backend-private identities for copying optional per-message caches after commit. */
export type ForkedMessageCopy = {
  source: Pick<AgentMessageView, 'id' | 'turnId'>;
  target: Pick<AgentMessageView, 'id' | 'turnId'>;
};

/**
 * Distinguishes a missing Session, a fork point that is not in it, and a fork
 * point whose own row has not settled. The last case is refused rather than
 * skipped: silently copying up to the previous message would return a fork the
 * caller never asked for.
 */
export type ForkSessionResult =
  | { status: 'forked'; session: AgentSessionView; messageCopies: ForkedMessageCopy[] }
  | { status: 'session-not-found' }
  | { status: 'message-not-found' }
  | { status: 'fork-point-unsettled' };

export type DeleteTurnInput = {
  sessionId: string;
  /** Deletion is turn-scoped: a lone message would orphan its tool pairing. */
  turnId: string;
};

/**
 * Distinguishes a missing Session, a turn that is not in it, and a turn whose
 * rows have not settled. The last case is refused rather than partially
 * applied: removing a placeholder that a live turn is still writing would
 * leave that turn persisting into a transcript it no longer belongs to.
 */
export type DeleteTurnResult =
  | { status: 'deleted'; deletedMessageIds: string[] }
  | { status: 'session-not-found' }
  | { status: 'turn-not-found' }
  | { status: 'turn-unsettled' };

export type UpdateStreamingAssistantMessageInput = {
  assistantMessageId: string;
  /** The Host's current in-memory projection of the assistant message parts. */
  parts: AgentMessagePart[];
};

export type FinalizeAssistantMessageInput = {
  assistantMessageId: string;
  /** Refuse a late completion from an execution that a retry has replaced. */
  turnId?: string;
  status: 'success' | 'error' | 'cancelled' | 'interrupted';
  parts: AgentMessagePart[];
  /** Runtime fallback counts, used only when no invocation ledger projection exists. */
  usage: Pick<MessageStats, 'inputTokens' | 'outputTokens' | 'totalTokens'> | null;
  /**
   * Terminal diagnostics, including cancellation reasons without an inline
   * data-error part. Not exposed by the transcript view.
   */
  error: AgentErrorView | null;
  /** Saved only on a successfully completed assistant row. */
  contextCheckpoint: RuntimeContextCheckpoint | null;
  /** Model-side messages of the turn; saved only on a successfully completed assistant row. */
  replay?: RuntimeTurnReplay | null;
  /** Runtime-owned message statistics; terminal timing is required at this persistence boundary. */
  runtimeStats: MessageRuntimeStatsInput & {
    runtimeTiming: MessageRuntimeTiming & { completedAt: number };
  };
};

/**
 * Host-owned storage port for Agent Sessions and their linear transcripts
 * (docs/references/agent/agent-persistence.md).
 *
 * The store persists messages only. The Turn is a Host projection: live turn
 * state (`running`/`awaiting-approval`/`cancelling`) and pending approvals are
 * process-local Host state by design, and terminal turn facts live on the
 * assistant message row. Multi-record operations are atomic at this boundary,
 * and the only Session creation operation reserves the first message pair with it.
 */
export interface AgentSessionStore {
  getSession(sessionId: string): Promise<AgentSessionView | null>;
  getRuntimeRevision(sessionId: string): Promise<number | null>;
  renameSession(sessionId: string, name: string): Promise<AgentSessionView | null>;
  /** Renames only when the current name still matches the caller's auto-name snapshot. */
  autoRenameSession(
    sessionId: string,
    expectedName: string,
    name: string,
  ): Promise<AgentSessionView | null>;
  /** Deletes the Session's messages with it. */
  deleteSession(sessionId: string): Promise<boolean>;
  /** Which of these message ids have a row; lets the Host reserve a turn exactly once. */
  existingMessageIds(messageIds: readonly string[]): Promise<Set<string>>;
  /** Stored replays of successful assistant rows, keyed by assistant message id. */
  readReplays(
    sessionId: string,
    assistantMessageIds: readonly string[],
  ): Promise<Record<string, RuntimeTurnReplay>>;
  /** Assistant rows still `pending`/`streaming`; the Host matches them against engine state. */
  listUnsettledAssistantMessages(): Promise<
    { sessionId: string; assistantMessageId: string; turnId: string | null }[]
  >;

  /** Atomically creates a Session and reserves its first user/assistant message pair. */
  reserveInitialSubmission(
    input: ReserveInitialSubmissionInput,
  ): Promise<ReserveInitialSubmissionResult>;

  /**
   * Atomically reserves the user message and assistant placeholder under a
   * fresh shared turnId before execution starts (protocol invariant 2).
   */
  reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult>;

  /**
   * Atomically reserves a fresh execution of an existing user/assistant pair,
   * keeping both message ids and their transcript position. Rejects unless the
   * assistant row is the Session's last message, is settled, and is immediately
   * preceded by the user row it shares a turn with: only the latest answer is
   * replaceable (agent-protocol.md "Manual answer retry").
   */
  reserveRetry(input: ReserveRetryInput): Promise<ReserveSubmissionResult>;

  /**
   * Atomically creates a Session carrying the source's transcript up to and
   * including the fork point (agent-protocol.md "Branching"). Unsettled rows
   * are skipped, turn ids are reissued so the copy shares no correlation with
   * its source, the copied anchor is recorded as the Session boundary, and no
   * turn is started: the new Session is idle.
   */
  forkSession(input: ForkSessionInput): Promise<ForkSessionResult>;

  /**
   * Atomically removes one turn's messages from a Session. The unit is the
   * turn, not the message: a replayed transcript pairs every `tool-call` with
   * its `tool-result`, and half a turn cannot be sent to a provider.
   *
   * Any context checkpoint whose summary covers the removed turn is cleared in
   * the same transaction. The summary text is opaque to the store, so a
   * checkpoint anchored at or after the deleted turn is assumed to contain it;
   * dropping the checkpoint costs a full replay on the next turn and is the
   * only way to keep deleted content out of the model's context.
   */
  deleteTurn(input: DeleteTurnInput): Promise<DeleteTurnResult>;

  listMessages(sessionId: string): Promise<AgentMessageView[]>;

  /**
   * Loads the bounded Runtime replay tail plus full-transcript authorization
   * indexes without materializing every message in the Host.
   */
  loadRuntimeTurnContext(
    sessionId: string,
    afterTurnId: string | null,
  ): Promise<StoredRuntimeTurnContext>;

  /**
   * Returns the newest assistant row carrying an opaque checkpoint candidate.
   * `excludeAssistantMessageId` skips one answer, so a retry does not resume
   * from a summary of the very answer it is about to replace.
   */
  getLatestContextCheckpoint(
    sessionId: string,
    excludeAssistantMessageId?: string,
  ): Promise<StoredRuntimeContextCheckpoint | null>;
  /** Save idle background compaction without replacing the already committed answer or timing. */
  saveContextCheckpoint(
    assistantMessageId: string,
    turnId: string,
    checkpoint: RuntimeContextCheckpoint,
  ): Promise<void>;

  /**
   * Durably records the parts an active turn has produced so far and marks the
   * placeholder `streaming`. A no-op once the row has settled: the terminal
   * write is the only authority for a settled message.
   */
  updateStreamingAssistantMessage(input: UpdateStreamingAssistantMessageInput): Promise<void>;

  /**
   * Atomically settles the assistant message's terminal state before terminal
   * events publish (protocol invariant 5).
   */
  finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView>;

  /**
   * Marks every unsettled message interrupted and stamps the turn-level error.
   * Returns the reconciled assistant placeholders so the Host can publish
   * their settled state to observers attached before recovery ran.
   */
  reconcileInterrupted(
    error: AgentErrorView,
    options?: { excludeSessionIds?: readonly string[] },
  ): Promise<AgentMessageView[]>;
}
