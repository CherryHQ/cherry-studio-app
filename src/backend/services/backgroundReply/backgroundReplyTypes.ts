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

export type BackgroundReplyOutcome = 'cancelled' | 'completed' | 'failed';

export type BackgroundReplyTurn = {
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
  dispose: () => void;
  startTurn: (input: BackgroundReplyTurnInput) => BackgroundReplyTurn;
};
