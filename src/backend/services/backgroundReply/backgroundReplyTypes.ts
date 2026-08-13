import type { CherryUIMessage } from '@cherrystudio/universal/data/types/message';

import type { BackgroundReplyPhase } from '@/shared/backgroundActivities/chatReply';

// The feature contract lives in shared so the service and activity
// registration agree on props; these re-exports keep the service-local import
// surface stable.
export type {
  BackgroundReplyActivityProps,
  BackgroundReplyContent,
  BackgroundReplyPhase,
} from '@/shared/backgroundActivities/chatReply';

export type BackgroundReplyOutcome = Extract<
  BackgroundReplyPhase,
  'cancelled' | 'completed' | 'failed'
>;

/**
 * Capability handle for one reply generation. Calls never throw, and handles
 * superseded by a newer generation become no-ops.
 */
export type BackgroundReplyTurn = {
  /** Settles after the initial native reconciliation and never rejects. */
  ready: Promise<void>;
  awaitApproval: (message?: CherryUIMessage) => void;
  finish: (outcome: BackgroundReplyOutcome) => void;
  update: (message: CherryUIMessage) => void;
};

export type BackgroundReplyTurnInput = {
  assistantName: string;
  topicId: string;
  topicTitle: string;
};

export type BackgroundReplyLifecycle = {
  clearTopic: (topicId: string) => void;
  startTurn: (input: BackgroundReplyTurnInput) => BackgroundReplyTurn;
};
