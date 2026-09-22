import { useRouter } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useStartNewChat } from '@/frontend/appShell/navigation/chat';

import { type SidebarActions, SidebarActionsContext } from '../context';
import { useSessionSearch } from '../hooks/useSessionSearch';
import { SidebarBody } from './SidebarBody';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';

type SidebarProps = {
  navigation: DrawerContentComponentProps['navigation'];
};

/** Drawer sidebar whose root owns the drawer-scoped actions. */
export function Sidebar({ navigation }: SidebarProps) {
  const router = useRouter();
  const startNewChat = useStartNewChat();
  const openSessionSearch = useSessionSearch();

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => navigation.closeDrawer(),
      openSearch: () => {
        navigation.closeDrawer();
        openSessionSearch();
      },
      navigateAgents: () => {
        navigation.closeDrawer();
        router.push('/agents');
      },
      openLibrary: () => {
        navigation.closeDrawer();
        router.push('/library');
      },
      openPaintings: () => {
        navigation.closeDrawer();
        router.push('/drawings');
      },
      openPlugins: () => {
        navigation.closeDrawer();
        router.push('/plugins');
      },
      openSettings: () => {
        navigation.closeDrawer();
        router.push('/settings');
      },
      startNewChat: () => {
        navigation.closeDrawer();
        void startNewChat();
      },
    }),
    [navigation, openSessionSearch, router, startNewChat],
  );

  return (
    <SidebarActionsContext value={actions}>
      <View className="flex-1" testID="sidebar">
        <SidebarBody />
        <SidebarHeader />
        <SidebarFooter />
      </View>
    </SidebarActionsContext>
  );
}
