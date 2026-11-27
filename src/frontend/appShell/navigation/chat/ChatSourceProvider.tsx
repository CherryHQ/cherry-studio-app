import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { Keyboard } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import { usePreference } from '@/frontend/data/hooks';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';

import { chatHref, chatRouteParams, type ChatTarget, parseChatRoute } from './chatRoute';
import {
  parseRemoteChatRoute,
  remoteChatHref,
  type RemoteChatRouteParams,
  type RemoteChatTarget,
} from './remoteChatRoute';
import {
  parseTeamChatRoute,
  teamChatHref,
  type TeamChatTarget,
  type TeamChatRouteParams,
} from './teamChatRoute';

type ChatSource = 'local' | 'remote' | 'team';
type ChatSourceNavigation = {
  source: ChatSource;
  /** Whether a chat, rather than another page beside the sidebar, fills the content region. */
  isChatFocused: boolean;
  /** The local chat on screen, or the last one shown while another page covers it. */
  localChat: ChatTarget | undefined;
  remoteTarget: RemoteChatTarget;
  teamTarget: TeamChatTarget;
  openLocal(target: ChatTarget): void;
  openTeam(target: TeamChatTarget): void;
  viewMode: 'sessions' | 'agents';
  remoteViewMode: 'sessions' | 'agents';
  setViewMode(mode: 'sessions' | 'agents'): Promise<void>;
  /** Opens the phone's own chats, or a paired desktop's when an id is given. */
  selectDevice(connectionId?: string): void;
  openRemote(target: RemoteChatTarget): void;
  startRemoteChat(agentId?: string): void;
};
const Context = createContext<ChatSourceNavigation | null>(null);

/**
 * The drawer owns source navigation; each source keeps its own last chat target. Pages opened beside
 * the sidebar keep the chat they cover as the current source, so the sidebar does not switch
 * catalogs while one of them is showing.
 */
export function ChatSourceProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<RemoteChatRouteParams & TeamChatRouteParams>();
  const isChatFocused = pathname === '/' || pathname === '/remote' || pathname === '/team';
  const [coveredChat, setCoveredChat] = useState(() => ({
    params: isChatFocused ? params : {},
    pathname: isChatFocused ? pathname : '/',
  }));
  if (isChatFocused && (coveredChat.pathname !== pathname || coveredChat.params !== params))
    setCoveredChat({ params, pathname });
  const chat = isChatFocused ? { params, pathname } : coveredChat;
  const source: ChatSource =
    chat.pathname === '/team' ? 'team' : chat.pathname === '/remote' ? 'remote' : 'local';
  const teamTarget = useMemo(() => parseTeamChatRoute(chat.params), [chat.params]);
  const remoteTarget = useMemo(() => parseRemoteChatRoute(chat.params), [chat.params]);
  const localRoute = useMemo(() => parseChatRoute(chat.params), [chat.params]);
  const localChat =
    source === 'local' && localRoute.status === 'ready' ? localRoute.target : undefined;
  const { connections } = useDesktopConnections();
  const lastLocal = useRef<ChatTarget | undefined>(undefined);
  const lastRemote = useRef<RemoteChatTarget | undefined>(undefined);
  const lastTeam = useRef<TeamChatTarget | undefined>(undefined);
  const lastPhoneKind = useRef<'local' | 'team'>('local');
  const [localViewMode, setLocalViewMode] = usePreference('ui.sidebar.recent_view_mode');
  const [remoteViewMode, setRemoteViewMode] = useState<'sessions' | 'agents'>('agents');
  const openLocal = useCallback(
    (target: ChatTarget) => {
      Keyboard.dismiss();
      if (source === 'team') lastTeam.current = teamTarget;
      if (source === 'remote') lastRemote.current = remoteTarget;
      lastLocal.current = target;
      lastPhoneKind.current = 'local';
      if (pathname === '/') router.setParams(chatRouteParams(target));
      else router.replace(chatHref(target));
    },
    [source, teamTarget, remoteTarget, pathname, router],
  );
  const openTeam = useCallback(
    (target: TeamChatTarget) => {
      Keyboard.dismiss();
      if (source === 'local' && localRoute.status === 'ready')
        lastLocal.current = localRoute.target;
      if (source === 'remote') lastRemote.current = remoteTarget;
      lastTeam.current = target;
      lastPhoneKind.current = 'team';
      if (pathname === '/team')
        router.setParams({
          bindingId: target.bindingId,
          agentId: target.agentId,
          sessionId: target.sessionId,
        });
      else router.replace(teamChatHref(target));
    },
    [source, localRoute, remoteTarget, pathname, router],
  );

  const openRemote = useCallback(
    (target: RemoteChatTarget) => {
      Keyboard.dismiss();
      lastRemote.current = target;
      if (pathname === '/remote') {
        router.setParams({
          connectionId: target.connectionId,
          agentId: target.agentId,
          sessionId: target.sessionId,
          draftId: target.draftId,
        });
      } else router.replace(remoteChatHref(target));
    },
    [pathname, router],
  );
  const selectDevice = useCallback(
    (connectionId?: string) => {
      if (!connectionId) {
        if (source !== 'remote') return;
        Keyboard.dismiss();
        lastRemote.current = remoteTarget;
        router.replace(
          lastPhoneKind.current === 'team' && lastTeam.current
            ? teamChatHref(lastTeam.current)
            : lastLocal.current
              ? chatHref(lastLocal.current)
              : '/',
        );
        return;
      }
      if (source === 'remote' && connectionId === remoteTarget.connectionId) return;
      if (source === 'local' && localRoute.status === 'ready')
        lastLocal.current = localRoute.target;
      if (source === 'team') {
        lastTeam.current = teamTarget;
        lastPhoneKind.current = 'team';
      } else if (source === 'local') {
        lastPhoneKind.current = 'local';
      }
      const previous = lastRemote.current;
      // Returning to the last desktop resumes its chat; another desktop starts at its catalog.
      openRemote(
        connectionId === previous?.connectionId ? { ...previous, connectionId } : { connectionId },
      );
    },
    [localRoute, openRemote, remoteTarget, router, source, teamTarget],
  );
  const startRemoteChat = useCallback(
    (agentId?: string) => {
      openRemote({
        connectionId: remoteTarget.connectionId,
        agentId: agentId ?? remoteTarget.agentId,
        draftId: uuidv7(),
      });
    },
    [openRemote, remoteTarget],
  );

  useEffect(() => {
    const first = connections.find((connection) => connection.status === 'paired');
    if (source === 'remote' && !remoteTarget.connectionId && first)
      openRemote({ connectionId: first.id });
  }, [connections, openRemote, remoteTarget.connectionId, source]);
  const setViewMode = useCallback(
    async (mode: 'sessions' | 'agents') => {
      if (source === 'remote') setRemoteViewMode(mode);
      else await setLocalViewMode(mode);
    },
    [source, setLocalViewMode],
  );
  const value = useMemo(
    () => ({
      source,
      isChatFocused,
      localChat,
      remoteTarget,
      teamTarget,
      openLocal,
      openTeam,
      selectDevice,
      openRemote,
      startRemoteChat,
      viewMode: source === 'remote' ? remoteViewMode : localViewMode,
      remoteViewMode,
      setViewMode,
    }),
    [
      source,
      isChatFocused,
      localChat,
      remoteTarget,
      teamTarget,
      openLocal,
      openTeam,
      selectDevice,
      openRemote,
      startRemoteChat,
      localViewMode,
      remoteViewMode,
      setViewMode,
    ],
  );
  return <Context value={value}>{children}</Context>;
}

export function useOptionalChatSource() {
  return use(Context);
}

export function useChatSource() {
  const value = use(Context);
  if (!value) throw new Error('Chat source navigation requires ChatSourceProvider');
  return value;
}
