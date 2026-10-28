import { useDrawerStatus } from 'expo-router/drawer';

import { useSidebarColumn } from '../SidebarColumn';

/**
 * Where the sidebar stands relative to the content. A permanent drawer still reports `closed`
 * through navigation state, so visibility combines the column with the overlay's status; a column
 * yielded to the file pane is hidden like a closed overlay.
 */
export type SidebarPresence = 'persistent' | 'open' | 'closed';

export function useSidebarPresence(): SidebarPresence {
  const { column } = useSidebarColumn();
  const drawerStatus = useDrawerStatus();

  return column.kind === 'permanent' ? 'persistent' : drawerStatus;
}
