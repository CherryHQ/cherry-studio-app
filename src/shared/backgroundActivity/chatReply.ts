import type { BackgroundActivityPresentation } from '@cherrystudio/ui/background-activity';

/**
 * Chat background-reply activity contract. Shared because the widget layout
 * (frontend) and BackgroundReplyRuntime (backend) both consume it and the
 * lint boundary forbids direct imports between those layers.
 */

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

export type BackgroundReplyActivityProps = BackgroundActivityPresentation & BackgroundReplyContent;
