import { useMemo, useState } from 'react';

import { createScrollInteraction } from './scroll-interaction';
import type {
  ScrollInteractionBoundaryProps,
  ScrollInteractionHandlers,
} from './scroll-interaction-boundary.types';
import { ScrollInteractionContext } from './scroll-interaction-context';

/** One state owner per scroll surface; contains no menu or keyboard policy. */
export function ScrollInteractionBoundary({
  children,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  onScrollBeginDrag,
  onScrollEndDrag,
  onTouchCancel,
  onTouchEnd,
  onTouchStart,
}: ScrollInteractionBoundaryProps) {
  const [interaction] = useState(createScrollInteraction);

  const handlers = useMemo<ScrollInteractionHandlers>(
    () => ({
      onMomentumScrollBegin: (event) => {
        interaction.beginMomentum();
        onMomentumScrollBegin?.(event);
      },
      onMomentumScrollEnd: (event) => {
        interaction.endMomentum();
        onMomentumScrollEnd?.(event);
      },
      onScrollBeginDrag: (event) => {
        interaction.beginDrag();
        onScrollBeginDrag?.(event);
      },
      onScrollEndDrag: (event) => {
        interaction.endDrag();
        onScrollEndDrag?.(event);
      },
      onTouchStart: (event) => {
        interaction.beginTouch();
        onTouchStart?.(event);
      },
      // A committed native long press can cancel RN touches. Only scrolling blocks
      // recognition, and that decision survives both callbacks until the next start.
      onTouchCancel,
      onTouchEnd,
    }),
    [
      interaction,
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      onScrollBeginDrag,
      onScrollEndDrag,
      onTouchCancel,
      onTouchEnd,
      onTouchStart,
    ],
  );

  return (
    <ScrollInteractionContext value={interaction}>{children(handlers)}</ScrollInteractionContext>
  );
}
