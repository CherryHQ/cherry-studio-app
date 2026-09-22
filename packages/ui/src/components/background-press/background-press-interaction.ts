import type { ScrollInteraction } from '../scroll-interaction/scroll-interaction';

/** Background presses own their cancellation, while each scroll surface owns its state. */
export function createBackgroundPressInteraction() {
  let cancelled = true;
  let excludedTouch: object | undefined;
  const scrollInteractions = new Set<ScrollInteraction>();
  const isScrolling = () => {
    for (const scroll of scrollInteractions) {
      if (scroll.isActive()) return true;
    }
    return false;
  };

  return {
    observeScroll(scroll: ScrollInteraction) {
      scrollInteractions.add(scroll);
      if (scroll.isActive()) cancelled = true;
      const unsubscribe = scroll.subscribeToScrollStart(() => {
        cancelled = true;
      });
      return () => {
        unsubscribe();
        scrollInteractions.delete(scroll);
        cancelled = true;
      };
    },
    beginTouch(touch: object) {
      cancelled = isScrolling() || excludedTouch === touch;
      excludedTouch = undefined;
    },
    excludeTouch(touch: object) {
      excludedTouch = touch;
      cancelled = true;
    },
    commitPress() {
      const accepted = !cancelled && !isScrolling();
      cancelled = true;
      return accepted;
    },
  };
}
