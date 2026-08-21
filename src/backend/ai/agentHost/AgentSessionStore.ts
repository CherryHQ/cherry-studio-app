import type {
  AgentApprovalView,
  AgentErrorView,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
  AgentTurnView,
  AgentUsageView,
} from '@/shared/contracts/agent';

export type ReserveTurnResult = {
  turn: AgentTurnView;
  userMessage: AgentMessageView;
  assistantMessage: AgentMessageView;
};

export type FinalizeTurnInput = {
  turnId: string;
  turnStatus: 'completed' | 'failed' | 'cancelled' | 'interrupted';
  turnError: AgentErrorView | null;
  assistantMessageId: string;
  messageStatus: 'success' | 'error' | 'cancelled' | 'interrupted';
  parts: AgentMessagePart[];
  usage: AgentUsageView | null;
};

/**
 * Host-owned storage port for Agent Sessions, turns, messages, and approvals.
 *
 * Multi-record operations are atomic at this boundary. The Host depends only
 * on these guarantees; lifecycle composition selects the concrete adapter.
 */
export interface AgentSessionStore {
  createSession(input: { agentId: string; title?: string }): Promise<AgentSessionView>;
  getSession(sessionId: string): Promise<AgentSessionView | null>;
  renameSession(sessionId: string, title: string): Promise<AgentSessionView | null>;
  /** Deletes the Session's turns, messages, and approvals with it. */
  deleteSession(sessionId: string): Promise<boolean>;

  /**
   * Atomically reserves the user message, assistant placeholder, and running
   * turn before execution starts (protocol invariant 2).
   */
  reserveTurn(input: {
    sessionId: string;
    userParts: AgentMessagePart[];
  }): Promise<ReserveTurnResult>;

  getTurn(turnId: string): Promise<AgentTurnView | null>;
  listMessages(sessionId: string): Promise<AgentMessageView[]>;

  setTurnStatus(
    turnId: string,
    status: 'running' | 'awaiting-approval' | 'cancelling',
  ): Promise<AgentTurnView | null>;

  /**
   * Atomically settles the assistant message and turn before terminal events
   * publish (protocol invariant 5).
   */
  finalizeTurn(input: FinalizeTurnInput): Promise<{
    turn: AgentTurnView;
    assistantMessage: AgentMessageView;
  }>;

  upsertApproval(approval: AgentApprovalView): Promise<void>;

  /**
   * Marks every available unfinished turn and unsettled message interrupted.
   * Returns the number of reconciled turns.
   */
  reconcileInterrupted(error: AgentErrorView): Promise<number>;
}
