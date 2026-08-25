import type { BackgroundReplyPhase } from '@/shared/backgroundActivity/chatReply';
import type { AgentMessageView } from '@/shared/contracts/agent';

// The feature contract lives in shared so the service and activity
// registration agree on props; these re-exports keep the service-local import
// surface stable.
export type {
  BackgroundReplyActivityProps,
  BackgroundReplyContent,
  BackgroundReplyPhase,
} from '@/shared/backgroundActivity/chatReply';

export type BackgroundReplyOutcome = Extract<
  BackgroundReplyPhase,
  'cancelled' | 'completed' | 'failed'
>;

export type BackgroundReplyMessage = Pick<AgentMessageView, 'parts'>;

/**
 * Capability handle for one reply generation. Calls never throw, and handles
 * superseded by a newer generation become no-ops.
 */
export type BackgroundReplyTurn = {
  awaitApproval: (message?: BackgroundReplyMessage) => void;
  /** Shows terminal content immediately; `waitFor` delays only final surface dismissal. */
  finish: (outcome: BackgroundReplyOutcome, options?: { waitFor?: Promise<unknown> }) => void;
  update: (message: BackgroundReplyMessage) => void;
};

export type BackgroundReplyTurnInput = {
  agentId: string;
  agentName: string;
  sessionId: string;
  sessionTitle: string;
};

export type BackgroundReplyLifecycle = {
  clearSession: (sessionId: string) => void;
  startTurn: (input: BackgroundReplyTurnInput) => BackgroundReplyTurn;
  updateSessionTitle: (sessionId: string, title: string) => void;
};
