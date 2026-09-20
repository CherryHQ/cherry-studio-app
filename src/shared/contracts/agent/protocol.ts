/**
 * The Agent Protocol interface implemented by the Mobile Agent Host and
 * consumed by the Agent Client, plus the process-local error wrapper.
 */

import type { AgentEvent, AgentSessionObservation } from './events';
import type {
  AgentDeleteTurnInput,
  AgentForkSessionInput,
  AgentRetryMessageInput,
  AgentStartSessionInput,
  AgentSubmitMessageInput,
} from './inputs';
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

  renameSession(input: { sessionId: string; title: string }): Promise<AgentSessionView>;
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

  /** Replaces a settled answer in place using context up to its original user input. */
  retryMessage(input: AgentRetryMessageInput): Promise<void>;

  submitMessage(
    input: AgentSubmitMessageInput,
  ): Promise<{ turnId: string; userMessageId: string; assistantMessageId: string }>;

  cancelTurn(input: { sessionId: string; turnId: string }): Promise<void>;

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
