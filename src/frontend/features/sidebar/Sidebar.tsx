import { useRouter } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { type ReactNode, useMemo } from 'react';
import { View } from 'react-native';

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

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => navigation.closeDrawer(),
      navigateAgents: () => {
        navigation.navigate('agents');
        navigation.closeDrawer();
      },
      openPaintings: () => {
        navigation.navigate('drawings');
        navigation.closeDrawer();
      },
      // Settings lives in the root stack so it can push over the drawer and
      // return to the exact drawer-backed route that opened it.
      openSettings: () => {
        navigation.closeDrawer();
        router.push('/settings');
      },
      openSessionList: () => {
        navigation.closeDrawer();
        router.push('/sessions');
      },
      startNewChat: () => {
        navigation.navigate('agents');
        navigation.closeDrawer();
      },
    }),
    [navigation, router],
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
