import type { BackgroundActivityBaseProps } from './types';

/**
 * Painting background-generation activity contract, shared between the widget
 * layout (frontend) and the painting job handler (backend).
 */

export type PaintingActivityPhase = 'cancelled' | 'completed' | 'failed' | 'generating';

export type PaintingActivityProps = BackgroundActivityBaseProps & {
  compactLabel: string;
  detail: string;
  phase: PaintingActivityPhase;
  /** Prompt excerpt shown in the expanded island. */
  preview?: string;
  title: string;
};
