import {
  type Href,
  useGlobalSearchParams,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { type NavigationState, StackActions } from 'expo-router/react-navigation';
import {
  type ComponentType,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useCanDockSidebar } from '@/frontend/appShell/layout';
import {
  chatRouteParams,
  createChatComposerHandoff,
  useChatSource,
  useConversationTarget,
} from '@/frontend/appShell/navigation/chat';
import { useFilePane } from '@/frontend/appShell/pane/state';
import type { AppSearchPanelProps } from '@/frontend/appShell/search';
import { useAgentSession, useAgentsApi } from '@/frontend/hooks/agent';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { type SidebarActions, SidebarActionsContext } from '../context';
import type { SessionSearchResult } from '../hooks/sessionSearch';
import { useCloseDrawerForNavigation } from '../hooks/useCloseDrawerForNavigation';
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

type NavigationTree = {
  key?: string;
  index?: number;
  routes: readonly {
    key?: string;
    name: string;
    params?: object;
    state?: NavigationTree;
  }[];
};
type NavigationRoute = NavigationTree['routes'][number];

// A refused pop should do nothing, never surprise the person with a draft on a later return.
const NEW_CHAT_RETURN_BUDGET_MS = 1500;
// Once focused, allow slower agent/session queries their own bounded wait.
const NEW_CHAT_RESOLUTION_BUDGET_MS = 15000;

function activeChain(state: NavigationTree | undefined) {
  const chain: { navigatorKey: string | undefined; route: NavigationRoute }[] = [];
  while (state) {
    const route = state.routes[state.index ?? 0];
    if (!route) break;
    chain.push({ navigatorKey: state.key, route });
    state = route.state;
  }
  return chain;
}

function navigationFingerprint(chain: ReturnType<typeof activeChain>) {
  return JSON.stringify(
    chain.map(({ navigatorKey, route }) => [
      navigatorKey,
      route.key,
      route.name,
      Object.entries(route.params ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ]),
  );
}

/** Only the active drawer/main chain admits a draft; drawer history is deliberately ignored. */
function chatNavigation(state: NavigationTree | undefined) {
  const chain = activeChain(state);
  const drawerIndex = chain.findIndex(({ route }) => route.name === '(drawer)');
  const mainEntry = drawerIndex >= 0 ? chain[drawerIndex + 1] : undefined;
  const main = mainEntry?.route.name === '(main)' ? mainEntry.route.state : undefined;
  const chat = main?.routes[0];
  const chatChain =
    chat?.name === '(chat)'
      ? [{ navigatorKey: main?.key, route: chat }, ...activeChain(chat.state)]
      : [];
  return {
    main,
    leaf: chatChain.at(-1)?.route,
    fingerprint: navigationFingerprint(chain),
    coveredFingerprint: navigationFingerprint([...chain.slice(0, drawerIndex + 2), ...chatChain]),
  };
}

type NewChatRequest = {
  generation: number;
  phase: 'returning' | 'resolving';
  originatingFingerprint: string;
  originatingLocation: string;
  coveredFingerprint: string;
  mainKey: string;
  leafKey: string;
  source: 'local' | 'remote';
  identity: string | undefined;
  connectionId: string | undefined;
  resolvingFingerprint?: string;
  agentFetch?: 'pending' | 'settled';
};

const NO_NEW_CHAT_GUARD = (_request: NewChatRequest) => false;

/** Sidebar whose root owns the drawer-scoped actions, whether it overlays the chat or sits beside it. */
export function Sidebar({ navigation, searchPanel: SearchPanel }: SidebarProps) {
  const router = useRouter();
  const rootState = useRootNavigationState();
  // Compare the exact route (including a nested page) and the context carried by its entry.
  const page =
    '/' +
    useSegments()
      .filter((segment) => !segment.startsWith('('))
      .join('/');
  const params = useGlobalSearchParams();
  const { source, remoteTarget, viewMode, localChat, isChatFocused, startRemoteChat } =
    useChatSource();
  const currentSession = useAgentSession(
    localChat?.kind === 'session' ? localChat.sessionId : undefined,
  );
  const currentAgentId =
    localChat?.kind === 'draft' ? localChat.agentId : currentSession.data?.agentId;
  const { agents, query: agentsQuery, refetch } = useAgentsApi();
  // Destinations act for the chat beside the sidebar, or the one a page currently covers.
  const agentId = localChat?.kind === 'draft' ? localChat.agentId : undefined;
  const sessionId = localChat?.kind === 'session' ? localChat.sessionId : undefined;
  // Serialized so the actions below change only when the chat does.
  const sourceChat = localChat ? JSON.stringify(chatRouteParams(localChat)) : undefined;
  const openSessionSearch = useSessionSearch();
  const searchRequest = useSessionSearchRequest();
  const canDock = useCanDockSidebar();
  const pane = useFilePane();
  const { column, setContent } = useSidebarColumn();
  const { cancelPending, waitForClose } = useCloseDrawerForNavigation(navigation, canDock);
  const currentConversation = useConversationTarget({ kind: 'local' });
  const { theme } = useUniwind();
  const surfaceColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');

  const requestRef = useRef<NewChatRequest | undefined>(undefined);
  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const committedGuardRef = useRef<(request: NewChatRequest) => boolean>(NO_NEW_CHAT_GUARD);
  const generationRef = useRef(0);
  const [, setRequestGeneration] = useState(0);
  const invalidateNewChat = useCallback(() => {
    generationRef.current++;
    clearTimeout(requestTimeoutRef.current);
    requestTimeoutRef.current = undefined;
    requestRef.current = undefined;
    committedGuardRef.current = NO_NEW_CHAT_GUARD;
  }, []);
  const committedNavigation = useMemo(() => chatNavigation(rootState), [rootState]);
  const location = JSON.stringify([
    page,
    Object.entries(params).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  const fingerprint = JSON.stringify([committedNavigation.fingerprint, location]);
  const identity =
    source === 'local'
      ? sourceChat
      : JSON.stringify([
          remoteTarget.connectionId,
          remoteTarget.agentId,
          remoteTarget.sessionId,
          remoteTarget.draftId,
        ]);

  const isCommittedChat =
    committedNavigation.main?.index === 0 &&
    committedNavigation.main.routes[0]?.name === '(chat)' &&
    committedNavigation.leaf?.name === (source === 'local' ? 'index' : 'remote') &&
    page === (source === 'local' ? '/' : '/remote') &&
    isChatFocused;
  const guardNewChat = useCallback(
    (request: NewChatRequest) => {
      const sameContext =
        source === request.source &&
        identity === request.identity &&
        remoteTarget.connectionId === request.connectionId &&
        committedNavigation.main?.key === request.mainKey &&
        committedNavigation.leaf?.key === request.leafKey &&
        committedNavigation.coveredFingerprint === request.coveredFingerprint;
      const isPoppedChat =
        committedNavigation.main?.index === 0 &&
        committedNavigation.fingerprint === request.coveredFingerprint;
      const allowedReturn =
        fingerprint === request.originatingFingerprint ||
        (isPoppedChat &&
          (location === request.originatingLocation ||
            page === (request.source === 'local' ? '/' : '/remote')));
      return (
        sameContext &&
        (request.phase === 'returning'
          ? allowedReturn
          : isCommittedChat && fingerprint === request.resolvingFingerprint)
      );
    },
    [
      source,
      identity,
      remoteTarget.connectionId,
      committedNavigation,
      fingerprint,
      location,
      page,
      isCommittedChat,
    ],
  );

  const abandonNewChat = useCallback(
    (generation: number) => {
      if (generationRef.current !== generation) return;
      const request = requestRef.current;
      if (request && committedGuardRef.current(request)) invalidateNewChat();
    },
    [invalidateNewChat],
  );
  const settleAgentRefetch = useCallback(
    (generation: number, result?: Awaited<ReturnType<typeof refetch>>) => {
      // Bound callbacks retain only the generation, never the request or a captured agent list.
      if (generationRef.current !== generation) return;
      const request = requestRef.current;
      if (!request) return;
      if (!result || result.isError) {
        invalidateNewChat();
        return;
      }
      request.agentFetch = 'settled';
      setRequestGeneration((value) => value + 1);
    },
    [invalidateNewChat],
  );

  useLayoutEffect(() => {
    const request = requestRef.current;
    if (!request) return;
    committedGuardRef.current = guardNewChat;
    if (generationRef.current !== request.generation || !committedGuardRef.current(request)) {
      invalidateNewChat();
      return;
    }
    if (request.phase === 'returning') {
      if (!isCommittedChat) return;
      request.phase = 'resolving';
      request.resolvingFingerprint = fingerprint;
      clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = undefined;
      if (request.source === 'local')
        requestTimeoutRef.current = setTimeout(
          abandonNewChat,
          NEW_CHAT_RESOLUTION_BUDGET_MS,
          request.generation,
        );
    }
    if (request.source === 'remote') {
      if (generationRef.current !== request.generation || !committedGuardRef.current(request))
        return;
      invalidateNewChat();
      startRemoteChat();
      return;
    }

    // useStartNewChat reads route-local input and navigates after an uncancellable await.
    // The sidebar instead decides from the preserved chat and queries on each committed render.
    if (localChat?.kind === 'session' && currentSession.isPending) return;
    if (agentsQuery.isPending && !request.agentFetch) {
      request.agentFetch = 'pending';
      void refetch().then(
        settleAgentRefetch.bind(null, request.generation),
        settleAgentRefetch.bind(null, request.generation, undefined),
      );
      return;
    }
    if (request.agentFetch === 'pending' || agentsQuery.isPending) return;
    const agentId = agents.find((agent) => agent.id === currentAgentId)?.id ?? agents[0]?.id;
    if (generationRef.current !== request.generation || !committedGuardRef.current(request)) return;
    invalidateNewChat();
    if (agentId) {
      router.setParams(
        chatRouteParams({
          kind: 'draft',
          agentId,
          composerHandoff: createChatComposerHandoff({ attachments: [], draft: '' }),
        }),
      );
    } else router.push('/agents');
  });

  useLayoutEffect(() => () => invalidateNewChat(), [invalidateNewChat]);

  // A permanent drawer has nothing to close, but an overlay left open before the window widened
  // would otherwise reappear over the chat once the window narrows again.
  useEffect(() => {
    if (canDock) navigation.closeDrawer();
  }, [canDock, navigation]);

  // A link or notification may already have navigated while the drawer was closing.
  useLayoutEffect(() => cancelPending, [cancelPending, page, params]);

  // Conversation actions assume the chat is on screen. Beside a wide window's page, return to the
  // chat first; pages above it are dismissed, as their own back steps would.
  const popToChat = useCallback(() => {
    const stack = getContentStack(navigation);
    if (stack && stack.index > 0)
      navigation.dispatch({ ...StackActions.popToTop(), target: stack.key });
  }, [navigation]);
  const returnToChat = useCallback(() => {
    invalidateNewChat();
    cancelPending();
    popToChat();
  }, [cancelPending, invalidateNewChat, popToChat]);

  // From the chat a destination opens above it; from another destination it takes that one's place,
  // so moving between sidebar entries never builds a back history.
  const openDestination = useCallback(
    async (href: Href, history: 'swap' | 'push' = 'swap') => {
      invalidateNewChat();
      if (!(await waitForClose())) return;
      const pathname = typeof href === 'string' ? href : href.pathname;
      if (
        page === pathname &&
        (typeof href === 'string' ||
          Object.entries(href.params ?? {}).every(([key, value]) => params[key] === value))
      )
        return;
      const stack = getContentStack(navigation);
      if (history === 'swap' && stack && stack.index > 0) router.replace(href);
      else router.push(href);
    },
    [invalidateNewChat, waitForClose, navigation, page, params, router],
  );

  const actions = useMemo<SidebarActions>(
    () => ({
      closeDrawer: () => {
        invalidateNewChat();
        navigation.closeDrawer();
        returnToChat();
      },
      prepareExternalNavigation: (signal) => {
        invalidateNewChat();
        return waitForClose(signal);
      },
      startNewChat: () => {
        invalidateNewChat();
        cancelPending();
        Keyboard.dismiss();
        if (!canDock) navigation.closeDrawer();
        const { main, leaf } = committedNavigation;
        if (!main?.key || !leaf?.key) return;
        const generation = generationRef.current;
        requestRef.current = {
          generation,
          phase: 'returning',
          originatingFingerprint: fingerprint,
          originatingLocation: location,
          coveredFingerprint: committedNavigation.coveredFingerprint,
          mainKey: main.key,
          leafKey: leaf.key,
          source,
          identity,
          connectionId: remoteTarget.connectionId,
        };
        // Install the tap's committed context before arming, even at main index zero.
        committedGuardRef.current = guardNewChat;
        requestTimeoutRef.current = setTimeout(
          abandonNewChat,
          NEW_CHAT_RETURN_BUDGET_MS,
          generation,
        );
        setRequestGeneration((value) => value + 1);
        popToChat();
      },
      returnToChat,
      openSearch:
        source === 'local'
          ? () => {
              invalidateNewChat();
              cancelPending();
              navigation.closeDrawer();
              // A wide window searches in the column, beside the chat its results open.
              if (canDock && SearchPanel) setContent('search');
              else openSessionSearch();
            }
          : undefined,
      navigateAgents: () => openDestination('/agents'),
      openLibrary: () => {
        invalidateNewChat();
        // Files open beside the current chat when the window has room for both. A library page
        // remembers that chat, so a file can still be added to it.
        if (pane?.isAvailable) {
          navigation.closeDrawer();
          returnToChat();
          pane.open();
        } else {
          return openDestination({ pathname: '/library', params: { sourceChat } }, 'push');
        }
      },
      openPaintings: () => openDestination('/drawings'),
      openPlugins: () => openDestination({ pathname: '/plugins', params: { agentId, sessionId } }),
      openSkills: () => openDestination({ pathname: '/skills', params: { agentId, sessionId } }),
      openScheduledTasks: () => {
        if (remoteTarget.connectionId)
          openDestination({
            pathname: '/scheduled-tasks/[connectionId]',
            params: { connectionId: remoteTarget.connectionId },
          });
      },
      openSettings: () => openDestination('/settings'),
    }),
    [
      agentId,
      abandonNewChat,
      guardNewChat,
      invalidateNewChat,
      committedNavigation,
      fingerprint,
      identity,
      location,
      popToChat,
      sessionId,
      sourceChat,
      navigation,
      cancelPending,
      waitForClose,
      canDock,
      openDestination,
      openSessionSearch,
      pane,
      returnToChat,
      SearchPanel,
      setContent,
      source,
      remoteTarget.connectionId,
    ],
  );

  const closeSearch = useCallback(() => setContent('sidebar'), [setContent]);
  const openSearchResult = useCallback(
    (result: SessionSearchResult) => {
      invalidateNewChat();
      // The chat it opens is what the user reads next; the keyboard would cover its composer.
      Keyboard.dismiss();
      returnToChat();
      router.navigate(sessionSearchResultHref(result));
    },
    [invalidateNewChat, returnToChat, router],
  );
  // The conversation target exists only while the chat itself is on screen.
  const isOpenResult = useCallback(
    (result: SessionSearchResult) =>
      result.kind === 'session' && result.item.id === currentConversation.sessionId,
    [currentConversation.sessionId],
  );
  const foldGap = column.kind === 'permanent' ? column.foldGap : 0;
  const isColumnHidden = column.kind === 'collapsed' || column.kind === 'yielded';
  const isSearching = Boolean(
    SearchPanel && column.kind === 'permanent' && column.content === 'search',
  );

  return (
    <SidebarActionsContext value={actions}>
      <SidebarSelectionProvider scope={`${source}:${remoteTarget.connectionId ?? ''}:${viewMode}`}>
        {/* A fold at the column's trailing edge stays empty, as it does beside the file pane. */}
        <View
          accessibilityElementsHidden={isColumnHidden}
          className="flex-1"
          importantForAccessibility={isColumnHidden ? 'no-hide-descendants' : 'auto'}
          style={{ marginEnd: foldGap }}
          testID="sidebar"
        >
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
