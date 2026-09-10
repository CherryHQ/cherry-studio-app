import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, type View } from 'react-native';

import { focusMenuTarget } from './menu-focus';
import type { MenuAnchor } from './menu.types';

const closedMenu = { anchor: null, isOpen: false } as const;

/** Retains the measured anchor through closing without clearing a reopened menu. */
export function useMenuState(triggerRef: RefObject<View | null>) {
  const [state, setState] = useState<{ anchor: MenuAnchor | null; isOpen: boolean }>(closedMenu);
  const currentAnchor = useRef<MenuAnchor | null>(null);
  const isOpen = useRef(false);
  const pendingAction = useRef<(() => void) | undefined>(undefined);
  const focusFrame = useRef<number | undefined>(undefined);
  const open = useCallback((anchor: MenuAnchor) => {
    if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    currentAnchor.current = anchor;
    isOpen.current = true;
    pendingAction.current = undefined;
    setState({ anchor, isOpen: true });
  }, []);
  const close = useCallback((afterClose?: () => void) => {
    if (isOpen.current) {
      isOpen.current = false;
      pendingAction.current = afterClose;
      setState((current) => ({ ...current, isOpen: false }));
    }
  }, []);
  const finishClose = useCallback(() => {
    if (isOpen.current || !state.anchor || currentAnchor.current !== state.anchor) return;
    currentAnchor.current = null;
    const action = pendingAction.current;
    pendingAction.current = undefined;
    setState(closedMenu);
    if (action) {
      action();
    } else {
      focusFrame.current = requestAnimationFrame(() => focusMenuTarget(triggerRef.current));
    }
  }, [state.anchor, triggerRef]);

  useEffect(() => {
    if (!state.anchor) return;
    const initialWindow = Dimensions.get('window');
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      if (
        window.width !== initialWindow.width ||
        window.height !== initialWindow.height ||
        window.fontScale !== initialWindow.fontScale
      )
        close();
    });
    return () => subscription.remove();
  }, [close, state.anchor]);
  useEffect(
    () => () => {
      currentAnchor.current = null;
      pendingAction.current = undefined;
      isOpen.current = false;
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    },
    [],
  );

  return { ...state, close, finishClose, open };
}
