import { createContext, use } from 'react';

export type SidebarActions = {
  closeDrawer: () => void;
  navigateAgents: () => void;
  navigateAssistants: () => void;
  openPaintings: () => void;
  openSettings: () => void;
  openSessionList: () => void;
  startNewChat: () => void;
};

export const SidebarActionsContext = createContext<SidebarActions | null>(null);

export function useSidebarActions(part: string): SidebarActions {
  const context = use(SidebarActionsContext);

  if (!context) {
    throw new Error(`${part} must be rendered inside a Sidebar`);
  }

  return context;
}
