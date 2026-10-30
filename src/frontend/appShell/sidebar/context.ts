import { createContext, use } from 'react';

export type SidebarActions = {
  /** Closes an overlay and brings the chat back in front of any page beside the sidebar. */
  closeDrawer: () => void;
  /** Brings the chat back in front of any page beside the sidebar, leaving an overlay open. */
  returnToChat: () => void;
  navigateAgents: () => void;
  openLibrary: () => void;
  openPlugins: () => void;
  openSkills: () => void;
  openPaintings: () => void;
  openSettings: () => void;
  openSearch?: () => void;
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
