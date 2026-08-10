import type { CherryUIMessage } from '@cherrystudio/universal/data/types/message';

export type BackgroundReplyPhase =
  | 'awaiting-approval'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'preparing'
  | 'responding'
  | 'thinking'
  | 'using-tool';

export type BackgroundReplyContent = {
  detail: string;
  phase: BackgroundReplyPhase;
  preview?: string;
};

export type BackgroundReplyActivityProps = BackgroundReplyContent & {
  assistantName: string;
  compactLabel: string;
  finishedAtEpochMs?: number;
  logoUri?: string;
  startedAtEpochMs: number;
};

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
};

export type BackgroundReplyLifecycle = {
  clearTopic: (topicId: string) => void;
  dispose: () => void;
  startTurn: (input: BackgroundReplyTurnInput) => BackgroundReplyTurn;
};
