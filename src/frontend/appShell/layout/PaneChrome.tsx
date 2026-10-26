import { createContext, type PropsWithChildren, use, useMemo } from 'react';

import type { HeaderToolbarAction } from '@/frontend/appShell/header';

type PaneChrome = {
  /** Leads the pane's header when the page declares no back behavior of its own. */
  leadingAction: HeaderToolbarAction;
};

const PaneChromeContext = createContext<PaneChrome | null>(null);

/**
 * Marks a page rendered in a side pane instead of its own native-stack screen. Such a page has no
 * native header or toolbar to write into, so `HeaderChrome` and bottom toolbars render inline.
 */
export function PaneChromeProvider({ children, leadingAction }: PropsWithChildren<PaneChrome>) {
  const value = useMemo(() => ({ leadingAction }), [leadingAction]);

  return <PaneChromeContext value={value}>{children}</PaneChromeContext>;
}

export function usePaneChrome() {
  return use(PaneChromeContext);
}
