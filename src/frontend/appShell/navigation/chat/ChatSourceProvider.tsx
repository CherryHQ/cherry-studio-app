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

import { chatHref, type ChatTarget, parseChatRoute } from './chatRoute';
import {
  parseRemoteChatRoute,
  remoteChatHref,
  type RemoteChatRouteParams,
  type RemoteChatTarget,
} from './remoteChatRoute';

type ChatSource = 'local' | 'remote';
type ChatSourceNavigation = {
  source: ChatSource;
  remoteTarget: RemoteChatTarget;
  viewMode: 'sessions' | 'agents';
  setViewMode(mode: 'sessions' | 'agents'): Promise<void>;
  selectSource(source: ChatSource): void;
  openRemote(target: RemoteChatTarget): void;
  startRemoteChat(agentId?: string): void;
};
const Context = createContext<ChatSourceNavigation | null>(null);

/** The drawer owns source navigation; each source keeps its own last chat target. */
export function ChatSourceProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<RemoteChatRouteParams>();
  const source: ChatSource = pathname === '/remote' ? 'remote' : 'local';
  const remoteTarget = useMemo(() => parseRemoteChatRoute(params), [params]);
  const localRoute = useMemo(() => parseChatRoute(params), [params]);
  const { connections } = useDesktopConnections();
  const lastLocal = useRef<ChatTarget | undefined>(undefined);
  const lastRemote = useRef<RemoteChatTarget | undefined>(undefined);
  const [localViewMode, setLocalViewMode] = usePreference('ui.sidebar.recent_view_mode');
  const [remoteViewMode, setRemoteViewMode] = useState<'sessions' | 'agents'>('agents');

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
  const selectSource = useCallback(
    (next: ChatSource) => {
      if (next === source) return;
      Keyboard.dismiss();
      if (next === 'local') {
        lastRemote.current = remoteTarget;
        router.replace(lastLocal.current ? chatHref(lastLocal.current) : '/');
      } else {
        if (localRoute.status === 'ready') lastLocal.current = localRoute.target;
        const previous = lastRemote.current;
        const connectionId =
          connections.find((item) => item.id === previous?.connectionId)?.id ??
          connections.find((item) => item.status === 'paired')?.id;
        openRemote(
          connectionId === previous?.connectionId
            ? { ...previous, connectionId }
            : { connectionId },
        );
      }
    },
    [connections, localRoute, openRemote, remoteTarget, router, source],
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
      if (source === 'local') await setLocalViewMode(mode);
      else setRemoteViewMode(mode);
    },
    [source, setLocalViewMode],
  );
  const value = useMemo(
    () => ({
      source,
      remoteTarget,
      selectSource,
      openRemote,
      startRemoteChat,
      viewMode: source === 'local' ? localViewMode : remoteViewMode,
      setViewMode,
    }),
    [
      source,
      remoteTarget,
      selectSource,
      openRemote,
      startRemoteChat,
      localViewMode,
      remoteViewMode,
      setViewMode,
    ],
  );
  return <Context value={value}>{children}</Context>;
}

export function useChatSource() {
  const value = use(Context);
  if (!value) throw new Error('Chat source navigation requires ChatSourceProvider');
  return value;
}
