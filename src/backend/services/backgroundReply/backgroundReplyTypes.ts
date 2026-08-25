import type { BackgroundReplyPhase } from '@/shared/backgroundActivity/chatReply';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type { CherryUIMessage } from '@/shared/data/types/message';

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

export type BackgroundReplyMessage =
  | Pick<AgentMessageView, 'parts'>
  | Pick<CherryUIMessage, 'parts'>;

/**
 * Capability handle for one reply generation. Calls never throw, and handles
 * superseded by a newer generation become no-ops.
 */
export type BackgroundReplyTurn = {
  awaitApproval: (message?: BackgroundReplyMessage) => void;
  finish: (outcome: BackgroundReplyOutcome) => void;
  update: (message: BackgroundReplyMessage) => void;
  updateConversationTitle: (title: string) => void;
};

export type AgentSessionBackgroundReplyTurnInput = {
  agentId: string;
  agentName: string;
  sessionId: string;
  sessionTitle: string;
};

/** Transitional input retained only until the old ChatRuntime is deleted in D. */
export type LegacyChatBackgroundReplyTurnInput = {
  assistantName: string;
  topicId: string;
  topicTitle: string;
};

export type BackgroundReplyTurnInput =
  | AgentSessionBackgroundReplyTurnInput
  | LegacyChatBackgroundReplyTurnInput;

export type BackgroundReplyLifecycle = {
  clearSession: (sessionId: string) => void;
  /** Transitional compatibility entry retained until D removes ChatRuntime. */
  clearTopic: (topicId: string) => void;
  startTurn: (input: BackgroundReplyTurnInput) => BackgroundReplyTurn;
};
