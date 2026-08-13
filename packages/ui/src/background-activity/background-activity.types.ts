export type BackgroundActivityIcon =
  | 'brain'
  | 'bubble-ellipsis'
  | 'bubble-exclamation'
  | 'check-circle'
  | 'hourglass'
  | 'paintbrush'
  | 'warning-triangle'
  | 'wrench'
  | 'x-circle';

/**
 * Closed presentation model for a system background-activity surface.
 *
 * Callers provide content and a registered icon only. CherryUI owns every
 * visual decision: layout, spacing, typography, colors, truncation, timer
 * placement, and platform adaptation.
 */
export type BackgroundActivityBasePresentation = {
  colorScheme?: 'dark' | 'light';
  finishedAtEpochMs?: number;
  logoUri?: string;
  startedAtEpochMs: number;
};

export type BackgroundActivityPresentation = BackgroundActivityBasePresentation & {
  compactIcon: BackgroundActivityIcon;
  /** Replaces the compact timer while a short status needs immediate attention. */
  compactLabel?: string;
  detail: string;
  icon: BackgroundActivityIcon;
  preview?: string;
  title: string;
};
