import { View } from 'react-native';

import { useSidebarActions } from '../context';
import { SidebarDock } from './SidebarDock';

// Floating dock anchor. Deliberately outside the body's fade (the dock staying
// opaque keeps one fixed anchor for the eye through the whole drag); the shared
// transform comes from the root's plane.
export function SidebarFooter() {
  const { openSettings, startNewChat } = useSidebarActions('Sidebar.Footer');

  return (
    <View className="absolute right-0 bottom-0 left-0" pointerEvents="box-none">
      {/* No blur band down here, unlike the header: `ScrollShadow`'s dissolve
          already carries this end on its own. The header needs blur because its
          title competes with rows sliding right under it; the dock's buttons
          are opaque and have no such contrast fight. */}
      <SidebarDock onNewChatPress={startNewChat} onSettingsPress={openSettings} />
    </View>
  );
}

SidebarFooter.displayName = 'Sidebar.Footer';
