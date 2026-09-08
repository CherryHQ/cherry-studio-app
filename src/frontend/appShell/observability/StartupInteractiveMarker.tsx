import { useObserve } from 'expo-observe';
import { useEffect, useRef } from 'react';

/**
 * Reports Time to Interactive for a cold-start entry screen.
 *
 * Mount this in every route that can be the first screen of a launch — the
 * router integration derives `cold_ttr` on its own, but TTI only exists once
 * something calls `markInteractive`, and the hook form is what attaches the
 * current route name to it. That hook needs a screen's route context, so this
 * cannot live in the root layout beside `StartupCoordinator`.
 *
 * The mark waits two frames rather than firing on mount, matching
 * `useStartupReadyAfterFrames`: Fabric commits a screen's first frame after the
 * effect runs, so marking on mount would time the JS tree, not the pixels. The
 * startup cover's own minimum visible duration is deliberately excluded — it is
 * a fixed product constant that would add the same offset to every device and
 * flatten the metric's spread.
 */
export function StartupInteractiveMarker() {
  const { markInteractive } = useObserve();
  const hasMarkedRef = useRef(false);

  useEffect(() => {
    if (hasMarkedRef.current) {
      return;
    }

    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        second = undefined;
        hasMarkedRef.current = true;
        markInteractive();
      });
    });

    return () => {
      cancelAnimationFrame(first);
      if (second !== undefined) {
        cancelAnimationFrame(second);
      }
    };
  }, [markInteractive]);

  return null;
}
