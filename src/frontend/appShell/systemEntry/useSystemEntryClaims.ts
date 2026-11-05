import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';

import type { SystemAction, SystemEntryModule } from '@/shared/contracts';

/**
 * Claims staged shares one at a time while the app shell can open them.
 *
 * A resolved claim has already completed its native entry, so this hook holds the only copy of the
 * share. It is delivered through the latest render's `deliver`, whatever effect started the claim;
 * when `deliver` cannot open it yet, it waits for the next ready pass. A claim requested while
 * another is in flight runs once that one settles.
 */
export function useSystemEntryClaims({
  deliver,
  isReady,
  module,
  onFailure,
}: {
  /** Returns false when the share cannot be opened yet. */
  deliver: (action: SystemAction) => boolean;
  isReady: boolean;
  module: SystemEntryModule;
  onFailure: () => void;
}) {
  const onDeliver = useEffectEvent(deliver);
  const onClaimFailure = useEffectEvent(onFailure);
  const activeClaim = useRef<(() => Promise<void>) | undefined>(undefined);
  const heldActions = useRef<SystemAction[]>([]);
  const isClaiming = useRef(false);
  const isClaimRequested = useRef(false);

  useEffect(() => {
    if (!isReady) return;

    const claim = async () => {
      if (AppState.currentState !== 'active') return;
      if (isClaiming.current) {
        isClaimRequested.current = true;
        return;
      }
      isClaiming.current = true;
      isClaimRequested.current = false;
      try {
        const action = await module.claimNext();
        if (action) {
          if (heldActions.current.length || !activeClaim.current || !onDeliver(action)) {
            heldActions.current.push(action);
          }
        }
      } catch {
        if (activeClaim.current) onClaimFailure();
      } finally {
        isClaiming.current = false;
        if (isClaimRequested.current) void activeClaim.current?.();
      }
    };

    activeClaim.current = claim;
    while (heldActions.current.length > 0 && onDeliver(heldActions.current[0])) {
      heldActions.current.shift();
    }
    const stopPending = module.subscribePending(() => void claim());
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void claim();
    });
    void claim();

    return () => {
      activeClaim.current = undefined;
      stopPending();
      foreground.remove();
    };
  }, [isReady, module]);
}
