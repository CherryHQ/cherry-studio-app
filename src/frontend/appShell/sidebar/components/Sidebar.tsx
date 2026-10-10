import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { useMemo } from 'react';
import { View } from 'react-native';

import {
  useStartNewChat,
  useChatSource,
  parseChatRoute,
  type ChatRouteParamsInput,
} from '@/frontend/appShell/navigation/chat';

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
  const chatRoute = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const agentId =
    chatRoute.status === 'ready' && chatRoute.target.kind === 'draft'
      ? chatRoute.target.agentId
      : undefined;
  const sessionId =
    chatRoute.status === 'ready' && chatRoute.target.kind === 'session'
      ? chatRoute.target.sessionId
      : undefined;
  const startNewChat = useStartNewChat();
  const openSessionSearch = useSessionSearch();
  const { source, startRemoteChat } = useChatSource();

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => navigation.closeDrawer(),
      openSearch:
        source === 'local'
          ? () => {
              navigation.closeDrawer();
              openSessionSearch();
            }
          : undefined,
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
        router.push({
          pathname: '/plugins',
          params: { agentId, sessionId },
        });
      },
      openSkills: () => {
        navigation.closeDrawer();
        router.push({ pathname: '/skills', params: { agentId, sessionId } });
      },
      openSettings: () => {
        navigation.closeDrawer();
        router.push('/settings');
      },
      startNewChat: () => {
        navigation.closeDrawer();
        if (source === 'remote') startRemoteChat();
        else void startNewChat();
      },
    }),
    [
      agentId,
      sessionId,
      navigation,
      openSessionSearch,
      router,
      source,
      startRemoteChat,
      startNewChat,
    ],
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
