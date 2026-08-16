import type { BackgroundActivityPresentation } from '@cherrystudio/ui/background-activity';

/**
 * Painting background-generation activity contract, shared between the widget
 * layout (frontend) and the painting job handler (backend).
 */

export type PaintingActivityPhase = 'cancelled' | 'completed' | 'failed' | 'generating';

export type PaintingActivityProps = BackgroundActivityPresentation & {
  phase: PaintingActivityPhase;
};
