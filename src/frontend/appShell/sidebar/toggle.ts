import { createContext, use } from 'react';

import type { SidebarToggleAction } from './resolveSidebarColumn';

/** What the header's sidebar button does, and the switch behind hiding or showing the column. */
export type SidebarToggle = {
  action: SidebarToggleAction;
  setCollapsed: (isCollapsed: boolean) => void;
};

export const SidebarToggleContext = createContext<SidebarToggle | undefined>(undefined);

/** The header's sidebar button, or undefined where it has none, including outside the drawer. */
export function useSidebarToggle() {
  return use(SidebarToggleContext);
}
