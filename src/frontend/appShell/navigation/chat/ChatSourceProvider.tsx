import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useRef,
  useState,
  useCallback,
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
  remoteTarget: RemoteChatTarget | undefined;
  viewMode: 'sessions' | 'agents';
  setViewMode(mode: 'sessions' | 'agents'): Promise<void>;
  /** Opens the phone's own chats, or a paired desktop's when an id is given. */
  selectDevice(connectionId?: string, domain?: 'agent' | 'assistant'): void;
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
  const lastRemote = useRef(new Map<string, RemoteChatTarget>());
  const [localViewMode, setLocalViewMode] = usePreference('ui.sidebar.recent_view_mode');
  const [remoteViewMode, setRemoteViewMode] = useState<'sessions' | 'agents'>('agents');

  const openRemote = useCallback(
    (target: RemoteChatTarget) => {
      Keyboard.dismiss();
      lastRemote.current.set(`${target.connectionId}:${target.domain ?? 'agent'}`, target);
      if (pathname === '/remote') {
        router.setParams({
          domain: target.domain,
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
    (connectionId?: string, requestedDomain?: 'agent' | 'assistant') => {
      if (!connectionId) {
        if (source === 'local') return;
        Keyboard.dismiss();
        if (remoteTarget)
          lastRemote.current.set(
            `${remoteTarget.connectionId}:${remoteTarget.domain ?? 'agent'}`,
            remoteTarget,
          );
        router.replace(lastLocal.current ? chatHref(lastLocal.current) : '/');
        return;
      }
      const connection = connections.find((item) => item.id === connectionId);
      const domain =
        requestedDomain ??
        (connectionId === remoteTarget?.connectionId ? remoteTarget.domain : undefined) ??
        (connection?.capabilities.includes('agent')
          ? 'agent'
          : connection?.capabilities.includes('assistant')
            ? 'assistant'
            : 'agent');
      if (
        source === 'remote' &&
        connectionId === remoteTarget?.connectionId &&
        domain === remoteTarget.domain
      )
        return;
      if (source === 'remote' && remoteTarget)
        lastRemote.current.set(
          `${remoteTarget.connectionId}:${remoteTarget.domain ?? 'agent'}`,
          remoteTarget,
        );
      if (source === 'local' && localRoute.status === 'ready')
        lastLocal.current = localRoute.target;
      const previous = lastRemote.current.get(`${connectionId}:${domain}`);
      // Returning to the last desktop resumes its chat; another desktop starts at its catalog.
      openRemote(previous ?? { connectionId, domain });
    },
    [connections, localRoute, openRemote, remoteTarget, router, source],
  );
  const startRemoteChat = useCallback(
    (agentId?: string) => {
      if (!remoteTarget) return;
      openRemote({
        domain: remoteTarget.domain,
        connectionId: remoteTarget.connectionId,
        agentId: agentId ?? remoteTarget.agentId,
        draftId: uuidv7(),
      });
    },
    [openRemote, remoteTarget],
  );

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
      selectDevice,
      openRemote,
      startRemoteChat,
      viewMode: source === 'local' ? localViewMode : remoteViewMode,
      setViewMode,
    }),
    [
      source,
      remoteTarget,
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

export function useChatSource() {
  const value = use(Context);
  if (!value) throw new Error('Chat source navigation requires ChatSourceProvider');
  return value;
}
