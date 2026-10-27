import { useDrawerStatus } from 'expo-router/drawer';

import { useIsSidebarPersistent } from '@/frontend/appShell/layout';

/**
 * Where the sidebar stands relative to the chat. A permanent drawer still reports `closed` through
 * navigation state, so visibility combines the layout with the overlay's status.
 */
export type SidebarPresence = 'persistent' | 'open' | 'closed';

export function useSidebarPresence(): SidebarPresence {
  const isPersistent = useIsSidebarPersistent();
  const drawerStatus = useDrawerStatus();

  return isPersistent ? 'persistent' : drawerStatus;
}
