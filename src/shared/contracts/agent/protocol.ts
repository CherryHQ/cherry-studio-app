/**
 * The Agent Protocol interface implemented by the Mobile Agent Host and
 * consumed by the Agent Client, plus the process-local error wrapper.
 */

import type { AgentEvent, AgentSessionObservation } from './events';
import type {
  AgentForkSessionInput,
  AgentStartSessionInput,
  AgentSubmitMessageInput,
} from './inputs';
import type { AgentErrorView, AgentSessionView } from './views';

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
