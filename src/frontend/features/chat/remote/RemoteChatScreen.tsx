import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  type RefObject,
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v7 as uuidv7 } from 'uuid';

import {
  ConversationSourceBoundary,
  useConversationSourceState,
  useConversation,
  useConversationAgents,
  useConversationHistory,
  useConversationSnapshot,
  useConversationSource,
  type AgentSummary,
  type ConversationRef,
  type DraftId,
} from '@/frontend/appShell/conversation';
import { MainHeaderView } from '@/frontend/appShell/header';
import { ChatDockFooter } from '@/frontend/appShell/layout';
import {
  conversationHref,
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
  useChatSource,
} from '@/frontend/appShell/navigation/chat';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
} from '@/frontend/components/Composer';
import { ConversationStatus } from '@/frontend/components/ConversationStatus';
import { usePersistCache } from '@/frontend/data/hooks';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { ChatWorkspace } from '../components/ChatWorkspace';
import { RemoteComposer } from './RemoteComposer';

export function RemoteChatScreen() {
  const target = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  return target.connectionId ? (
    <ConversationSourceBoundary
      key={target.connectionId}
      source={{ kind: 'desktop', connectionId: target.connectionId }}
      fallback={(state) => <RemoteChatUnavailable state={state} />}
    >
      <RemoteChatSession />
    </ConversationSourceBoundary>
  ) : (
    <RemoteChatUnavailable state="unpaired" />
  );
}
function RemoteChatUnavailable({ state }: { state: 'loading' | 'error' | 'unpaired' }) {
  const { t } = useTranslation();
  return (
    <ChatScreenFrame header={UnresolvedRemoteHeader}>
      <View className="flex-1 justify-center px-8 py-16">
        {state === 'loading' ? (
          <ContentState.Loading title={t('remoteAgent.connecting')} />
        ) : state === 'error' ? (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{
              children: t('settings.deviceConnections.title'),
              onPress: () => router.push('/settings/device-connections'),
            }}
          />
        ) : (
          <ContentState.Empty
            title={t('settings.deviceConnections.empty')}
            description={t('settings.deviceConnections.emptyDescription')}
            primaryAction={{
              children: t('settings.deviceConnections.scan.action'),
              onPress: () => router.push('/settings/device-connections/scan'),
            }}
          />
        )}
      </View>
    </ChatScreenFrame>
  );
}
function UnresolvedRemoteHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const { startRemoteChat } = useChatSource();
  return <MainHeaderView blurTarget={blurTarget} onNewChat={() => startRemoteChat()} />;
}
const HeaderContext = createContext<AgentSummary | undefined>(undefined);
function RemoteHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const agent = use(HeaderContext);
  const { startRemoteChat } = useChatSource();
  return (
    <MainHeaderView
      agent={agent}
      blurTarget={blurTarget}
      onNewChat={() => startRemoteChat(agent?.id)}
    />
  );
}
const ignorePending = () => {};
function RemoteChatSession() {
  const source = useConversationSource();
  const { availability } = useConversationSourceState();
  const target = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const [initialDraftId] = useState(() => uuidv7());
  const draftId = (target.draftId ?? initialDraftId) as DraftId;
  const opened = useConversation(
    target.sessionId ? { source: source.ref, sessionId: target.sessionId } : undefined,
    source,
  );
  const snapshot = useConversationSnapshot(opened.session);
  const history = useConversationHistory(opened.session, snapshot.historyVersion);
  const agents = useConversationAgents();
  const agentId = snapshot.agentId ?? target.agentId;
  const agent = agentId
    ? agents.items.find((item) => item.id === agentId)
    : target.sessionId
      ? undefined
      : agents.items[0];
  useEffect(() => {
    if (agentId && !agent && agents.hasNextPage && !agents.isFetchingNextPage && !agents.isError)
      void agents.fetchNextPage();
  }, [agentId, agent, agents]);
  const [handoff, setHandoff] = useState<{ sessionId: string; key: string }>();
  const identity = target.sessionId
    ? handoff?.sessionId === target.sessionId
      ? handoff.key
      : `session:${target.sessionId}`
    : `draft:${draftId}:${agentId ?? ''}`;
  const draftKey = `${source.draftScope}:${target.connectionId}:${target.sessionId ? `session:${target.sessionId}` : identity}`;
  const [drafts] = usePersistCache('remote_agent.drafts');
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const origin = useRef(identity);
  useEffect(() => {
    origin.current = identity;
  }, [identity]);
  const onSessionCreated = (ref: ConversationRef) => {
    if (!focused.current || origin.current !== identity) return false;
    setHandoff({ sessionId: ref.sessionId, key: identity });
    router.replace(conversationHref(ref));
    return true;
  };
  return (
    <HeaderContext value={agent}>
      <ChatScreenFrame header={RemoteHeader}>
        <ComposerSessionProvider
          key={`${source.scope}:${identity}`}
          initialDraft={drafts[draftKey] ?? ''}
        >
          <ComposerDismissArea disabled testID="chat-background">
            {opened.error ? (
              <ContentState.Error
                title={t('remoteAgent.loadFailed')}
                primaryAction={{ children: t('common.retry'), onPress: opened.retry }}
              />
            ) : (
              <ChatWorkspace
                conversation={opened.session}
                snapshot={snapshot}
                messageWindow={history}
                sessionId={target.sessionId}
                assistantName={agent?.name}
                isAssistantToolbarEnabled
                contentBottomInset={composerContentGap}
                keyboardOffset={getComposerKeyboardStickyOffset(bottom)}
                onPendingSendDisplayed={ignorePending}
              />
            )}
          </ComposerDismissArea>
          <ComposerDock layoutMode="flow">
            <View>
              <ConversationStatus
                availability={availability}
                onRepair={() => router.push('/settings/device-connections')}
              />
              {!target.sessionId && agents.isError ? (
                <ContentState.Error
                  title={t('remoteAgent.loadFailed')}
                  primaryAction={{
                    children: t('common.retry'),
                    onPress: () => void agents.refetch(),
                  }}
                />
              ) : null}
              {!target.sessionId && agents.isSuccess && !agents.items.length ? (
                <ContentState.Empty title={t('remoteAgent.noAgents')} />
              ) : null}
              <RemoteComposer
                agent={agent}
                session={opened.session}
                snapshot={snapshot}
                draftId={target.sessionId ? undefined : draftId}
                draftKey={draftKey}
                onSessionCreated={onSessionCreated}
              />
              <ChatDockFooter>
                <Text className="text-center text-xs text-muted-foreground">
                  {t('chat.input.disclaimer')}
                </Text>
              </ChatDockFooter>
            </View>
          </ComposerDock>
        </ComposerSessionProvider>
      </ChatScreenFrame>
    </HeaderContext>
  );
}
