import { useRouter } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { type ReactNode, useMemo } from 'react';
import { View } from 'react-native';

import { useStartNewChat } from '@/frontend/components/navigation/chat';

import { SidebarBody } from './components/SidebarBody';
import { SidebarFooter } from './components/SidebarFooter';
import { SidebarHeader } from './components/SidebarHeader';
import { type SidebarActions, SidebarActionsContext } from './context';

type SidebarProps = {
  children?: ReactNode;
  navigation: DrawerContentComponentProps['navigation'];
};

/**
 * Drawer sidebar as a compound component: `Sidebar.Header` / `Sidebar.Body` /
 * `Sidebar.Footer` under a root that owns the drawer-scoped actions. Header and
 * footer float transparently over the body, which scrolls underneath them.
 * Without children it renders the standard composition, so the drawer layout
 * can stay a thin adapter.
 */
function SidebarRoot({ children, navigation }: SidebarProps) {
  const router = useRouter();
  const startNewChat = useStartNewChat();

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => navigation.closeDrawer(),
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
      openSettings: () => {
        navigation.closeDrawer();
        router.push('/settings');
      },
      openSessionList: (view = 'sessions') => {
        navigation.closeDrawer();
        router.push({ pathname: '/sessions', params: { view } });
      },
      startNewChat: () => {
        navigation.closeDrawer();
        void startNewChat();
      },
    }),
    [navigation, router, startNewChat],
  );

  return (
    <SidebarActionsContext value={actions}>
      <View className="flex-1 bg-background">
        {children ?? (
          <>
            <SidebarBody />
            <SidebarHeader />
            <SidebarFooter />
          </>
        )}
      </View>
    </SidebarActionsContext>
  );
}

SidebarRoot.displayName = 'Sidebar';

export const Sidebar = Object.assign(SidebarRoot, {
  Body: SidebarBody,
  Footer: SidebarFooter,
  Header: SidebarHeader,
});
