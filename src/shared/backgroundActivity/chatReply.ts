import type { BackgroundActivityPresentation } from '@cherrystudio/ui/background-activity';

import type { BackgroundActivityActions } from './actions';

/**
 * Chat background-reply activity contract. Shared because the widget layout
 * (frontend) and BackgroundReplyRuntime (backend) both consume it and the
 * lint boundary forbids direct imports between those layers.
 */

export type BackgroundReplyPhase =
  | 'awaiting-approval'
  | 'awaiting-answer'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'preparing'
  | 'responding'
  | 'thinking'
  | 'using-tool';

export type BackgroundReplyContent = {
  /** Stable request identity, so successive requests in the same phase each alert once. */
  attentionId?: string;
  detail: string;
  phase: BackgroundReplyPhase;
  preview?: string;
};

export type BackgroundReplyActivityProps = BackgroundActivityPresentation &
  BackgroundReplyContent & {
    actions?: BackgroundActivityActions;
  };
