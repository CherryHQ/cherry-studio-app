/**
 * The Agent Protocol interface implemented by the Mobile Agent Host and
 * consumed by the Agent Client, plus the process-local error wrapper.
 */

import type { AgentEvent, AgentSessionObservation } from './events';
import type {
  AgentDeleteTurnInput,
  AgentForkSessionInput,
  AgentRetryMessageInput,
  AgentSelectMessageInput,
  AgentStartSessionInput,
  AgentSubmitMessageInput,
} from './inputs';
import type { AgentRespondQuestionInput } from './userQuestion';
import type { AgentErrorView, AgentSessionStatus, AgentSessionView } from './views';

/**
 * Protocol operation failure. The `view` is the JSON-safe protocol value; the
 * Error wrapper is process-local transport, like subscription callbacks.
 */
export class AgentProtocolError extends Error {
  constructor(readonly view: AgentErrorView) {
    super(view.message);
    this.name = 'AgentProtocolError';
  }
}

export interface AgentProtocol {
  /** Stable, immutable snapshot; null until this generation runs a turn in the Session. */
  getSessionStatus(sessionId: string): AgentSessionStatus | null;
  /** Status-only observation: does not load or subscribe to the transcript. */
  subscribeSessionStatus(sessionId: string, listener: () => void): () => void;

  renameSession(input: { sessionId: string; name: string }): Promise<AgentSessionView>;
  deleteSession(input: { sessionId: string }): Promise<void>;

  /** Creates the durable Session only when its first submission is admitted. */
  startSession(input: AgentStartSessionInput): Promise<AgentSessionView>;

  /**
   * Copies the transcript up to and including `fromMessageId` into a new idle
   * Session. Turns and approvals are not copied, so the fork opens a new future
   * without claiming to undo the side effects recorded in its history.
   */
  forkSession(input: AgentForkSessionInput): Promise<AgentSessionView>;

  /**
   * Removes one settled turn from the transcript and clears any context
   * checkpoint that may have summarized it. The turn's side effects are not
   * undone: this erases the record, not what the record describes.
   */
  deleteTurn(input: AgentDeleteTurnInput): Promise<void>;

  /**
   * Regenerating a settled answer adds a sibling answer to the same question and
   * selects it; a failed latest answer is retried in place. The original answer
   * stays in the tree.
   */
  retryMessage(input: AgentRetryMessageInput): Promise<AgentSessionView | void>;

  /**
   * Selects the branch containing `messageId`. Unless it is already on the
   * selected branch, the Session's selected leaf moves to the newest leaf below
   * it. Switching never calls a model or stops work running on another branch.
   */
  selectMessage(input: AgentSelectMessageInput): Promise<AgentSessionView>;

  submitMessage(
    input: AgentSubmitMessageInput,
  ): Promise<{ turnId: string; userMessageId: string; assistantMessageId: string }>;

  cancelTurn(input: { sessionId: string; turnId: string; messageId?: string }): Promise<void>;

  /** Withdraw only waiting input; never abort a run that won the admission race. */
  cancelQueuedInput(input: {
    sessionId: string;
    turnId: string;
  }): Promise<'withdrawn' | 'already-started' | 'not-found'>;

  /**
   * Abandons a submission, retry, or Draft start that has not reserved its turn
   * yet; the pending call rejects with `CANCELLED`. A reserved turn is
   * cancelled through `cancelTurn`. Idempotent.
   */
  cancelSubmission(input: { sessionId: string }): Promise<void>;

  respondQuestion(input: AgentRespondQuestionInput): Promise<void>;

  respondApproval(input: {
    sessionId: string;
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void>;

  observeSession(
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): Promise<AgentSessionObservation>;
}
