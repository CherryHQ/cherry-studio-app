import { View } from 'react-native';

import { useSidebarActions } from '../context';
import { SidebarDock } from './SidebarDock';

// Floating dock anchor, kept outside the body's scroller.
export function SidebarFooter() {
  const { openSettings, startNewChat } = useSidebarActions('Sidebar.Footer');

  return (
    <View className="absolute right-0 bottom-0 left-0" pointerEvents="box-none">
      <SidebarDock onNewChatPress={startNewChat} onSettingsPress={openSettings} />
    </View>
  );
}

SidebarFooter.displayName = 'Sidebar.Footer';
