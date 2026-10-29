import type {
  AgentErrorView,
  AgentEditMessageInput,
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
import type { SkillActivation } from '@/shared/data/types/skill';

import type { RuntimeContextCheckpoint } from '../runtime';

/** Only successful built-in load receipts and Host-written user selections count. */
export type StoredSkillActivation = { messageId: string; activation: SkillActivation };

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
};

export type ReserveSubmissionResult = {
  /** Correlation id shared by the question and every answer reserved for it. */
  turnId: string;
  userMessage: AgentMessageView;
  assistantMessage: AgentMessageView;
  /** Further multi-model answers, in the order they were requested. */
  additionalAssistantMessages: AgentMessageView[];
};

export type ReservedAnswerInput = {
  assistantMessageId: string;
  modelId: AgentInferenceSnapshotV1['model']['uniqueModelId'];
  inferenceSnapshot: AgentInferenceSnapshotV1;
};

export type ReserveSubmissionInput = ReservedAnswerInput & {
  sessionId: string;
  userMessageId: string;
  userParts: AgentMessagePart[];
  /**
   * Message the question continues from: null starts the tree, and omitted
   * continues the Session's selected leaf. The new answer becomes the selected leaf.
   */
  parentMessageId?: string | null;
  /** Answers by further models, reserved in one multi-model sibling group. */
  additionalReplies?: ReservedAnswerInput[];
};

/** A further answer to an existing question, reserved as its newest sibling. */
export type ReserveAnswerInput = ReservedAnswerInput & {
  sessionId: string;
  userMessageId: string;
};

export type ReserveInitialSubmissionInput = Omit<ReserveSubmissionInput, 'parentMessageId'> & {
  agentId: string;
  workspaceFolderId?: string;
};

export type ReserveInitialSubmissionResult = ReserveSubmissionResult & {
  session: AgentSessionView;
};

export type ReserveRetryInput = Omit<
  ReserveSubmissionInput,
  'parentMessageId' | 'additionalReplies'
> & {
  /** Recorded prefix the replacement execution keeps; empty restarts the answer. */
  assistantParts: AgentMessagePart[];
};

export type ForkSessionInput = {
  sessionId: string;
  /** Inclusive fork point; the copy holds its ancestor chain only. */
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

export type EditMessageInput = AgentEditMessageInput & {
  expectedRevision: number;
  /** Refreshed contexts of compacted copies, each saved on that copy's newest answer. */
  contextCheckpoints: { assistantMessageId: string; checkpoint: RuntimeContextCheckpoint }[];
};

export type EditMessageResult =
  | { status: 'edited'; message: AgentMessageView }
  | { status: 'session-not-found' | 'message-not-found' | 'conflict' };

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
  /** Runtime-owned message statistics; terminal timing is required at this persistence boundary. */
  runtimeStats: MessageRuntimeStatsInput & {
    runtimeTiming: MessageRuntimeTiming & { completedAt: number };
  };
};

/**
 * Host-owned storage port for Agent Sessions and their message trees
 * (docs/references/agent/agent-persistence.md).
 *
 * History readers take an optional `through` message: the ancestor chain
 * ending there is the history. Omitted, it is the Session's selected leaf;
 * null is an empty history.
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
  /** Assistant rows still `pending`/`streaming`; the Host matches them against engine state. */
  listUnsettledAssistantMessages(): Promise<
    { sessionId: string; assistantMessageId: string; turnId: string | null }[]
  >;

  /** Atomically creates a Session and reserves its first user/assistant message pair. */
  reserveInitialSubmission(
    input: ReserveInitialSubmissionInput,
  ): Promise<ReserveInitialSubmissionResult>;

  /**
   * Atomically reserves the user message below its parent and one assistant
   * placeholder per requested model under a fresh shared turnId before
   * execution starts (protocol invariant 2), and selects the first answer.
   */
  reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult>;

  /** Atomically reserves a sibling answer to an existing question and selects it. */
  reserveAnswer(input: ReserveAnswerInput): Promise<ReserveSubmissionResult>;

  /**
   * Atomically reserves a fresh execution of an existing user/assistant pair,
   * keeping both message ids and their tree position. Rejects unless the
   * assistant row is a settled leaf whose parent is the user row it shares a
   * turn with (agent-protocol.md "Manual answer retry").
   */
  reserveRetry(input: ReserveRetryInput): Promise<ReserveSubmissionResult>;

  /**
   * Selects the branch containing `messageId`: unchanged when it is already on
   * the selected branch, otherwise the newest leaf below it becomes the active
   * node. Null when the Session or message no longer exists.
   */
  selectMessage(sessionId: string, messageId: string): Promise<AgentSessionView | null>;

  /**
   * Atomically creates a Session carrying the ancestor chain of the fork point,
   * the fork point included (agent-protocol.md "Branching"). Unsettled rows
   * are skipped, turn ids are reissued so the copy shares no correlation with
   * its source, the copied anchor is recorded as the Session boundary, and no
   * turn is started: the new Session is idle.
   */
  forkSession(input: ForkSessionInput): Promise<ForkSessionResult>;

  /**
   * Atomically removes one turn's messages from a Session: the question and all
   * of its answers. The unit is the turn, not the message: a replayed
   * transcript pairs every `tool-call` with its `tool-result`, and half a turn
   * cannot be sent to a provider. Later questions below the removed answers move
   * to the removed question's parent, as Desktop's non-cascading delete does.
   *
   * Any context checkpoint whose summary covers the removed turn is cleared in
   * the same transaction. The summary text is opaque to the store, so a
   * checkpoint anchored at or after the deleted turn is assumed to contain it;
   * dropping the checkpoint costs a full-history rebuild on the next turn and is the
   * only way to keep deleted content out of the model's context.
   */
  deleteTurn(input: DeleteTurnInput): Promise<DeleteTurnResult>;

  /**
   * Atomically edits a successful answer, drops its own stale checkpoint, saves refreshed copy
   * checkpoints and advances the history revision.
   */
  editMessage(input: EditMessageInput): Promise<EditMessageResult>;

  /**
   * Remove an unexecuted reservation after the Runtime confirms withdrawal. Unlike deleting
   * history, this cannot invalidate the current context or another input's execution.
   */
  discardQueuedTurn(input: DeleteTurnInput): Promise<string[]>;

  /** The ancestor chain ending at `through`, oldest first. */
  listMessages(sessionId: string, through?: string | null): Promise<AgentMessageView[]>;

  getMessage(sessionId: string, messageId: string): Promise<AgentMessageView | null>;

  /** The question and all its answers, including settled siblings of an active answer. */
  listTurnMessages(sessionId: string, turnId: string): Promise<AgentMessageView[]>;

  /** Managed-file grants on the ancestor chain, without loading message bodies. */
  listReferencedFileEntryIds(sessionId: string, through?: string | null): Promise<string[]>;

  /** Whether any message continues from `messageId`. */
  hasChildren(sessionId: string, messageId: string): Promise<boolean>;

  /**
   * Loads the history tail a working-copy rebuild imports plus history
   * authorization indexes without materializing every message in the Host.
   */
  loadRuntimeTurnContext(
    sessionId: string,
    afterTurnId: string | null,
    through?: string | null,
  ): Promise<StoredRuntimeTurnContext>;

  /** Skill load receipts and explicit selections across the history, oldest first. */
  loadSkillActivations(
    sessionId: string,
    through?: string | null,
  ): Promise<StoredSkillActivation[]>;

  /** Workflow ids from successful load receipts across the history, oldest first. */
  loadWorkflowLoads(sessionId: string, through?: string | null): Promise<string[]>;

  /**
   * Returns the newest assistant row of the history carrying an opaque
   * checkpoint candidate. `excludeAssistantMessageId` skips one answer, so a
   * retry does not resume from a summary of the very answer it is replacing.
   */
  getLatestContextCheckpoint(
    sessionId: string,
    excludeAssistantMessageId?: string,
    through?: string | null,
  ): Promise<StoredRuntimeContextCheckpoint | null>;
  /** Save idle background compaction without replacing the already committed answer or timing. */
  saveContextCheckpoint(
    assistantMessageId: string,
    turnId: string,
    checkpoint: RuntimeContextCheckpoint,
  ): Promise<void>;

  /**
   * Atomically settles the assistant message's terminal state before terminal
   * events publish (protocol invariant 5).
   */
  finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView>;
}
