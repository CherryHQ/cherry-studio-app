import { useDrawerStatus } from 'expo-router/drawer';
import { createContext, type PropsWithChildren, use } from 'react';

import { useSidebarColumn } from '../SidebarColumn';

/**
 * Where the sidebar stands relative to the content. A permanent drawer still reports `closed`
 * through navigation state, so visibility combines the column with the overlay's status; a column
 * yielded to the file pane is hidden like a closed overlay.
 */
export type SidebarPresence = 'persistent' | 'open' | 'closed';

const OverlayPresence = createContext<'open' | 'closed'>('closed');

export function OverlaySidebarPresenceProvider({ children }: PropsWithChildren) {
  const status = useDrawerStatus();
  return <OverlayPresence value={status}>{children}</OverlayPresence>;
}

export function useSidebarPresence(): SidebarPresence {
  const { column } = useSidebarColumn();
  const drawerStatus = use(OverlayPresence);

  if (column.kind === 'overlay') return drawerStatus;
  return column.kind === 'permanent' ? 'persistent' : 'closed';
}
