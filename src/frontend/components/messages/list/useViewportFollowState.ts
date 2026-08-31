import { useCallback, useMemo, useRef, useState } from 'react';

export type FollowingReason =
  | 'local-send'
  | 'restored-bottom'
  | 'scroll-to-bottom'
  | 'user-reached-bottom';

export type ReadingReason = 'initializing' | 'navigation' | 'restored-anchor' | 'user-scrolled-up';

export type ViewportFollowState =
  | { readonly mode: 'following'; readonly reason: FollowingReason }
  | { readonly mode: 'reading'; readonly reason: ReadingReason };

export type ViewportFollowController = {
  enterFollowing(reason: FollowingReason): void;
  enterReading(reason: ReadingReason): void;
  getState(): ViewportFollowState;
  isFollowing(): boolean;
};

/** The single product-level source of truth for message-list scroll behavior. */
export function useViewportFollowState() {
  const stateRef = useRef<ViewportFollowState>({ mode: 'reading', reason: 'initializing' });
  const [isFollowingForRender, setIsFollowingForRender] = useState(false);

  const getState = useCallback(() => stateRef.current, []);
  const isFollowing = useCallback(() => stateRef.current.mode === 'following', []);
  const enterFollowing = useCallback((reason: FollowingReason) => {
    const didModeChange = stateRef.current.mode !== 'following';
    stateRef.current = { mode: 'following', reason };
    if (didModeChange) {
      setIsFollowingForRender(true);
    }
  }, []);
  const enterReading = useCallback((reason: ReadingReason) => {
    const didModeChange = stateRef.current.mode !== 'reading';
    stateRef.current = { mode: 'reading', reason };
    if (didModeChange) {
      setIsFollowingForRender(false);
    }
  }, []);

  const controller = useMemo(
    () => ({ enterFollowing, enterReading, getState, isFollowing }),
    [enterFollowing, enterReading, getState, isFollowing],
  );

  return { controller, isFollowingForRender };
}
