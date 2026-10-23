import { useGlobalSearchParams, useRouter } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { useIsSidebarPersistent } from '@/frontend/appShell/layout';
import {
  useStartNewChat,
  useChatSource,
  parseChatRoute,
  type ChatRouteParamsInput,
} from '@/frontend/appShell/navigation/chat';

import { type SidebarActions, SidebarActionsContext } from '../context';
import { useSessionSearch } from '../hooks/useSessionSearch';
import { SidebarSelectionProvider } from '../SidebarSelectionProvider';
import { SidebarBody } from './SidebarBody';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';

type SidebarProps = {
  navigation: DrawerContentComponentProps['navigation'];
};

/** Sidebar whose root owns the drawer-scoped actions, whether it overlays the chat or sits beside it. */
export function Sidebar({ navigation }: SidebarProps) {
  const router = useRouter();
  const { source, remoteTarget, viewMode, startRemoteChat } = useChatSource();
  // The drawer is outside the chat screen's local route-parameter context.
  const chatRoute = parseChatRoute(useGlobalSearchParams<ChatRouteParamsInput>());
  const agentId =
    source === 'local' && chatRoute.status === 'ready' && chatRoute.target.kind === 'draft'
      ? chatRoute.target.agentId
      : undefined;
  const sessionId =
    source === 'local' && chatRoute.status === 'ready' && chatRoute.target.kind === 'session'
      ? chatRoute.target.sessionId
      : undefined;
  const startNewChat = useStartNewChat();
  const openSessionSearch = useSessionSearch();
  const isPersistent = useIsSidebarPersistent();

  // A permanent drawer has nothing to close, but an overlay left open before the window widened
  // would otherwise reappear over the chat once the window narrows again.
  useEffect(() => {
    if (isPersistent) navigation.closeDrawer();
  }, [isPersistent, navigation]);

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
      <SidebarSelectionProvider scope={`${source}:${remoteTarget.connectionId ?? ''}:${viewMode}`}>
        <View className="flex-1" testID="sidebar">
          <SidebarBody />
          <SidebarHeader />
          <SidebarFooter />
        </View>
      </SidebarSelectionProvider>
    </SidebarActionsContext>
  );
}
