/** The scroll surface owns drag/momentum facts and cancellation for its current touch. */
export function createScrollInteraction() {
  let dragging = false;
  let momentum = false;
  let touchBlocked = false;
  const listeners = new Set<() => void>();
  const isActive = () => dragging || momentum;
  const notifyScrollStart = () => {
    for (const listener of listeners) listener();
  };

  return {
    isActive,
    isRecognitionBlocked: () => isActive() || touchBlocked,
    subscribeToScrollStart(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beginTouch() {
      touchBlocked = isActive();
    },
    beginDrag() {
      dragging = true;
      touchBlocked = true;
      notifyScrollStart();
    },
    endDrag() {
      dragging = false;
    },
    beginMomentum() {
      momentum = true;
      touchBlocked = true;
      notifyScrollStart();
    },
    endMomentum() {
      momentum = false;
    },
  };
}

/** Consumers can observe scroll ownership, but only the boundary can change it. */
export type ScrollInteraction = Pick<
  ReturnType<typeof createScrollInteraction>,
  'isActive' | 'isRecognitionBlocked' | 'subscribeToScrollStart'
>;
