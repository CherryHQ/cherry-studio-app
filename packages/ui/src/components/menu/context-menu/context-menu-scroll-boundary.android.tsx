import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { GestureResponderEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { ContextMenuScrollBoundaryContent } from './context-menu-scroll-boundary-content';
import type { ContextMenuScrollBoundaryProps } from './context-menu-scroll-boundary.types';

type ContextMenuInteraction = {
  isRecognitionBlocked: () => boolean;
};

const DEFAULT_CONTEXT_MENU_INTERACTION: ContextMenuInteraction = {
  isRecognitionBlocked: () => false,
};

const ContextMenuInteractionContext = createContext<ContextMenuInteraction>(
  DEFAULT_CONTEXT_MENU_INTERACTION,
);

/**
 * Gives descendant context menus the scroll owner's drag and momentum state.
 * A touch that begins during momentum remains blocked for its complete touch
 * sequence, even after that touch stops the momentum animation.
 */
export function ContextMenuScrollBoundary({
  children,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  onScrollBeginDrag,
  onScrollEndDrag,
  onTouchCancel,
  onTouchEnd,
  onTouchStart,
}: ContextMenuScrollBoundaryProps) {
  const isScrollInteractionActive = useRef(false);
  const isCurrentTouchBlocked = useRef(false);

  const handleMomentumScrollBegin = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrollInteractionActive.current = true;
      onMomentumScrollBegin?.(event);
    },
    [onMomentumScrollBegin],
  );
  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrollInteractionActive.current = false;
      onMomentumScrollEnd?.(event);
    },
    [onMomentumScrollEnd],
  );
  const handleScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrollInteractionActive.current = true;
      onScrollBeginDrag?.(event);
    },
    [onScrollBeginDrag],
  );
  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrollInteractionActive.current = false;
      onScrollEndDrag?.(event);
    },
    [onScrollEndDrag],
  );
  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      isCurrentTouchBlocked.current = isScrollInteractionActive.current;
      onTouchStart?.(event);
    },
    [onTouchStart],
  );
  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      onTouchEnd?.(event);
      isCurrentTouchBlocked.current = false;
    },
    [onTouchEnd],
  );
  const handleTouchCancel = useCallback(
    (event: GestureResponderEvent) => {
      onTouchCancel?.(event);
      isCurrentTouchBlocked.current = false;
    },
    [onTouchCancel],
  );
  const interaction = useMemo<ContextMenuInteraction>(
    () => ({
      isRecognitionBlocked: () =>
        isScrollInteractionActive.current || isCurrentTouchBlocked.current,
    }),
    [],
  );

  return (
    <ContextMenuInteractionContext.Provider value={interaction}>
      <ContextMenuScrollBoundaryContent
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchStart={handleTouchStart}
      >
        {children}
      </ContextMenuScrollBoundaryContent>
    </ContextMenuInteractionContext.Provider>
  );
}

export function useContextMenuInteraction() {
  return useContext(ContextMenuInteractionContext);
}
