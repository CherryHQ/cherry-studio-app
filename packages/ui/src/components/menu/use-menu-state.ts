import { useCallback, useState } from 'react';

import type { MenuAnchor } from './menu-content';

const closedMenu = { anchor: null, isOpen: false } as const;

/** Retains the measured anchor through closing without clearing a reopened menu. */
export function useMenuState() {
  const [state, setState] = useState<{ anchor: MenuAnchor | null; isOpen: boolean }>(closedMenu);
  const open = useCallback((anchor: MenuAnchor) => setState({ anchor, isOpen: true }), []);
  const close = useCallback(() => {
    setState((current) => (current.isOpen ? { ...current, isOpen: false } : current));
  }, []);
  const finishClose = useCallback(() => {
    setState((current) => (current.isOpen ? current : closedMenu));
  }, []);

  return { ...state, close, finishClose, open };
}
