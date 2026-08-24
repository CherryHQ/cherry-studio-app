import { usePathname, useRouter } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
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
  const pathname = usePathname();
  // Actions read the pathname through a ref so their identity — and with it
  // every slot consuming the actions context — survives route changes.
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => navigation.closeDrawer(),
      navigateAssistants: () => {
        navigation.navigate('assistants');
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
      openTopicList: () => {
        navigation.closeDrawer();
        router.push('/topics');
      },
      startNewChat: () => {
        // No topic row is created here: the chat surface with no `topicId` is
        // the new-chat state, and the backend creates the topic on first send.
        if (pathnameRef.current === '/') {
          router.setParams({ assistantId: undefined, topicId: undefined });
        } else {
          router.navigate({ params: {}, pathname: '/' });
        }
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
