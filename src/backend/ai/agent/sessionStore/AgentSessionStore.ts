import type {
  AgentErrorView,
  AgentExecutionTarget,
  AgentInferenceSnapshotV1,
  AgentInputQueue,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
  AgentSessionInput,
  AgentUsageView,
} from '@/shared/contracts/agent';
import type { MessageRuntimeStatsInput, MessageRuntimeTiming } from '@/shared/data/types/message';

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

export type EnqueueSessionInput = Pick<
  AgentSessionInput,
  'id' | 'sessionId' | 'parts' | 'mode' | 'modelId' | 'reasoningEffort' | 'targetTurnId'
>;

export type UpdateSessionInput = {
  id: string;
  sessionId: string;
  expectedStatus: AgentSessionInput['status'][];
  patch: Partial<Pick<AgentSessionInput, 'parts' | 'mode' | 'targetTurnId' | 'status' | 'reason'>>;
};

export type ConsumeSessionInput = ReserveSubmissionInput & {
  inputId: string;
  /** Present together only at a native steering consumption boundary. */
  continuation?: { turnId: string; previousAssistant: FinalizeAssistantMessageInput };
};

export type ConsumeSessionInputResult = ReserveSubmissionResult & {
  previousAssistantMessage: AgentMessageView | null;
};

export type ReserveInitialSubmissionInput = Omit<ReserveSubmissionInput, 'sessionId'> & {
  agentId: string;
  executionTarget: AgentExecutionTarget;
};

export type ReserveInitialSubmissionResult = ReserveSubmissionResult & {
  session: AgentSessionView;
};

export type ForkSessionInput = {
  sessionId: string;
  /** Inclusive fork point, identified by message rather than by turn. */
  fromMessageId: string;
  /** Overrides the copied source title; the store never composes one itself. */
  title?: string;
};

/**
 * Distinguishes a missing Session, a fork point that is not in it, and a fork
 * point whose own row has not settled. The last case is refused rather than
 * skipped: silently copying up to the previous message would return a fork the
 * caller never asked for.
 */
export type ForkSessionResult =
  | { status: 'forked'; session: AgentSessionView }
  | { status: 'session-not-found' }
  | { status: 'message-not-found' }
  | { status: 'fork-point-unsettled' };

export type UpdateStreamingAssistantMessageInput = {
  assistantMessageId: string;
  /** The Host's current in-memory projection of the assistant message parts. */
  parts: AgentMessagePart[];
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
  /** Runtime-owned message statistics; terminal timing is required at this persistence boundary. */
  runtimeStats: MessageRuntimeStatsInput & {
    runtimeTiming: MessageRuntimeTiming & { completedAt: number };
  };
};

/**
 * Host-owned storage port for Agent Sessions and their linear transcripts
 * (docs/references/agent/agent-persistence.md).
 *
 * Pending inputs and their idempotency receipts are separate from messages. The Turn is a Host projection: live turn
 * state (`running`/`awaiting-approval`/`cancelling`) and pending approvals are
 * process-local Host state by design, and terminal turn facts live on the
 * assistant message row. Multi-record operations are atomic at this boundary,
 * and the only Session creation operation reserves the first message pair with it.
 */
export interface AgentSessionStore {
  /** Duplicate identities return the existing receipt without changing queue order. */
  enqueueInput(input: EnqueueSessionInput): Promise<{ input: AgentSessionInput; created: boolean }>;
  getInput(inputId: string): Promise<AgentSessionInput | null>;
  getInputQueue(sessionId: string): Promise<AgentInputQueue>;
  setInputQueuePaused(sessionId: string, isPaused: boolean): Promise<void>;
  /** Compare-and-set protects consumed inputs from late edit/delete/promote commands. */
  updateInput(input: UpdateSessionInput): Promise<AgentSessionInput | null>;
  /** Requires an exact permutation of the queued/interrupted identities. */
  reorderInputs(sessionId: string, inputIds: string[]): Promise<boolean>;
  /** Atomically consumes an input, settles an optional prior segment, and reserves U/A. */
  consumeInput(input: ConsumeSessionInput): Promise<ConsumeSessionInputResult>;
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

  /**
   * Atomically creates a Session carrying the source's transcript up to and
   * including the fork point (agent-protocol.md "Branching"). Unsettled rows
   * are skipped, turn ids are reissued so the copy shares no correlation with
   * its source, the copied anchor is recorded as the Session boundary, and no
   * turn is started: the new Session is idle.
   */
  forkSession(input: ForkSessionInput): Promise<ForkSessionResult>;

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
  reconcileInterrupted(error: AgentErrorView): Promise<AgentMessageView[]>;
}
