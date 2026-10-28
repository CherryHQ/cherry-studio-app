import { type Href, useRouter } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { type NavigationState, StackActions } from 'expo-router/react-navigation';
import { type ComponentType, useCallback, useEffect, useMemo } from 'react';
import { Keyboard, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useIsSidebarPersistent } from '@/frontend/appShell/layout';
import {
  chatRouteParams,
  useChatSource,
  useConversationTarget,
  useStartNewChat,
} from '@/frontend/appShell/navigation/chat';
import { useFilePane } from '@/frontend/appShell/pane/state';
import type { AppSearchPanelProps } from '@/frontend/appShell/search';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { type SidebarActions, SidebarActionsContext } from '../context';
import type { SessionSearchResult } from '../hooks/sessionSearch';
import {
  sessionSearchResultHref,
  useSessionSearch,
  useSessionSearchRequest,
} from '../hooks/useSessionSearch';
import { useSidebarColumn } from '../SidebarColumn';
import { SidebarSelectionProvider } from '../SidebarSelectionProvider';
import { SidebarBody } from './SidebarBody';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';

type SidebarNavigation = DrawerContentComponentProps['navigation'];

type SidebarProps = {
  navigation: SidebarNavigation;
  /** Renders conversation search in the column of a wide window; supplied by the route layer. */
  searchPanel?: ComponentType<AppSearchPanelProps<SessionSearchResult>>;
};

/**
 * The stack of pages beside the sidebar: the chat at its root and destinations above it. A wide
 * window can reach the sidebar from any of them, so actions read it when they run.
 */
function getContentStack(navigation: SidebarNavigation) {
  const route = navigation.getState().routes.find((candidate) => candidate.name === '(main)');
  return route?.state as NavigationState | undefined;
}

/** Sidebar whose root owns the drawer-scoped actions, whether it overlays the chat or sits beside it. */
export function Sidebar({ navigation, searchPanel: SearchPanel }: SidebarProps) {
  const router = useRouter();
  const { source, remoteTarget, viewMode, startRemoteChat, localChat } = useChatSource();
  // Destinations act for the chat beside the sidebar, or the one a page currently covers.
  const agentId = localChat?.kind === 'draft' ? localChat.agentId : undefined;
  const sessionId = localChat?.kind === 'session' ? localChat.sessionId : undefined;
  // Serialized so the actions below change only when the chat does.
  const sourceChat = localChat ? JSON.stringify(chatRouteParams(localChat)) : undefined;
  const startNewChat = useStartNewChat();
  const openSessionSearch = useSessionSearch();
  const searchRequest = useSessionSearchRequest();
  const isPersistent = useIsSidebarPersistent();
  const pane = useFilePane();
  const { column, setContent } = useSidebarColumn();
  const currentConversation = useConversationTarget({ kind: 'local' });
  const { theme } = useUniwind();
  const surfaceColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');

  // A permanent drawer has nothing to close, but an overlay left open before the window widened
  // would otherwise reappear over the chat once the window narrows again.
  useEffect(() => {
    if (isPersistent) navigation.closeDrawer();
  }, [isPersistent, navigation]);

  // Conversation actions assume the chat is on screen. Beside a wide window's page, return to the
  // chat first; pages above it are dismissed, as their own back steps would.
  const returnToChat = useCallback(() => {
    const stack = getContentStack(navigation);
    if (stack && stack.index > 0)
      navigation.dispatch({ ...StackActions.popToTop(), target: stack.key });
  }, [navigation]);

  // From the chat a destination opens above it; from another destination it takes that one's place,
  // so moving between sidebar entries never builds a back history.
  const openDestination = useCallback(
    (href: Href) => {
      navigation.closeDrawer();
      const stack = getContentStack(navigation);
      if (stack && stack.index > 0) router.replace(href);
      else router.push(href);
    },
    [navigation, router],
  );

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => {
        navigation.closeDrawer();
        returnToChat();
      },
      returnToChat,
      openSearch:
        source === 'local'
          ? () => {
              navigation.closeDrawer();
              // A wide window searches in the column, beside the chat its results open.
              if (isPersistent && SearchPanel) setContent('search');
              else openSessionSearch();
            }
          : undefined,
      navigateAgents: () => openDestination('/agents'),
      openLibrary: () => {
        navigation.closeDrawer();
        // Files open beside the current chat when the window has room for both. A library page
        // remembers that chat, so a file can still be added to it.
        if (pane?.isAvailable) {
          returnToChat();
          pane.open();
        } else router.push({ pathname: '/library', params: sourceChat ? { sourceChat } : {} });
      },
      openPaintings: () => openDestination('/drawings'),
      openPlugins: () => openDestination({ pathname: '/plugins', params: { agentId, sessionId } }),
      openSkills: () => openDestination({ pathname: '/skills', params: { agentId, sessionId } }),
      openSettings: () => openDestination('/settings'),
      startNewChat: () => {
        navigation.closeDrawer();
        returnToChat();
        if (source === 'remote') startRemoteChat();
        else void startNewChat();
      },
    }),
    [
      agentId,
      sessionId,
      sourceChat,
      navigation,
      isPersistent,
      openDestination,
      openSessionSearch,
      pane,
      returnToChat,
      router,
      SearchPanel,
      setContent,
      source,
      startRemoteChat,
      startNewChat,
    ],
  );

  const closeSearch = useCallback(() => setContent('sidebar'), [setContent]);
  const openSearchResult = useCallback(
    (result: SessionSearchResult) => {
      // The chat it opens is what the user reads next; the keyboard would cover its composer.
      Keyboard.dismiss();
      returnToChat();
      router.navigate(sessionSearchResultHref(result));
    },
    [returnToChat, router],
  );
  // The conversation target exists only while the chat itself is on screen.
  const isOpenResult = useCallback(
    (result: SessionSearchResult) =>
      result.kind === 'session' && result.item.id === currentConversation.sessionId,
    [currentConversation.sessionId],
  );
  const foldGap = column.kind === 'permanent' ? column.foldGap : 0;
  const isSearching = Boolean(
    SearchPanel && column.kind === 'permanent' && column.content === 'search',
  );

  return (
    <SidebarActionsContext value={actions}>
      <SidebarSelectionProvider scope={`${source}:${remoteTarget.connectionId ?? ''}:${viewMode}`}>
        {/* A fold at the column's trailing edge stays empty, as it does beside the file pane. */}
        <View className="flex-1" style={{ marginEnd: foldGap }} testID="sidebar">
          {/* Search covers the sidebar instead of replacing it, so its list keeps its place. */}
          <View
            accessibilityElementsHidden={isSearching}
            className="flex-1"
            importantForAccessibility={isSearching ? 'no-hide-descendants' : 'auto'}
          >
            <SidebarBody />
            <SidebarHeader />
            <SidebarFooter />
          </View>
          {isSearching && SearchPanel ? (
            <View className="absolute inset-0" style={{ backgroundColor: surfaceColor }}>
              <SearchPanel
                isSelected={isOpenResult}
                onClose={closeSearch}
                onSelect={openSearchResult}
                request={searchRequest}
              />
            </View>
          ) : null}
        </View>
      </SidebarSelectionProvider>
    </SidebarActionsContext>
  );
}
