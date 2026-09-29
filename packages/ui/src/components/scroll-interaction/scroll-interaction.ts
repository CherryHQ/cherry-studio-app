/** The scroll surface owns drag/momentum facts and cancellation for its current touch. */
export function createScrollInteraction() {
  let dragging = false;
  let momentum = false;
  let touchBlocked = false;
  const isActive = () => dragging || momentum;

  return {
    isActive,
    isRecognitionBlocked: () => isActive() || touchBlocked,
    beginTouch() {
      touchBlocked = isActive();
    },
    beginDrag() {
      dragging = true;
      touchBlocked = true;
    },
    endDrag() {
      dragging = false;
    },
    beginMomentum() {
      momentum = true;
      touchBlocked = true;
    },
    endMomentum() {
      momentum = false;
    },
  };
}

/** Consumers can observe scroll ownership, but only the boundary can change it. */
export type ScrollInteraction = Pick<
  ReturnType<typeof createScrollInteraction>,
  'isActive' | 'isRecognitionBlocked'
>;
