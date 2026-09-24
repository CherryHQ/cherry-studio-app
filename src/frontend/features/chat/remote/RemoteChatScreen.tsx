import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useLocalSearchParams } from 'expo-router';
import { type RefObject, createContext, use, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ConversationSourceBoundary,
  useConversationSourceState,
  useConversationAgents,
  type AgentSummary,
} from '@/frontend/appShell/conversation';
import {
  useConversation,
  useConversationHistory,
  useConversationSnapshot,
  useRemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import { MainHeaderView, MainHeaderAgentPickerSheet } from '@/frontend/appShell/header';
import { ChatDockFooter } from '@/frontend/appShell/layout';
import {
  conversationShareHref,
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
import type { MessageListItem } from '@/frontend/components/Message';
import { usePersistCache } from '@/frontend/data/hooks';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { ChatWorkspace, RemoteAssistantMessageUsage } from '../components/ChatWorkspace';
import { ConversationPresenter } from './ConversationPresenter';
import { RemoteComposer } from './RemoteComposer';
import { useRemoteChatNavigation } from './useRemoteChatNavigation';

const renderRemoteUsage = (message: MessageListItem) => (
  <RemoteAssistantMessageUsage message={message} />
);

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
const HeaderContext = createContext<{
  agent?: AgentSummary;
  selectAgent(agentId: string): void;
  startNewChat(agentId?: string): void;
} | null>(null);
function RemoteHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const header = use(HeaderContext)!;
  const catalog = useConversationAgents();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <MainHeaderView
        agent={header.agent}
        blurTarget={blurTarget}
        onNewChat={() => header.startNewChat(header.agent?.id)}
        onAgentPress={() => {
          Keyboard.dismiss();
          setPickerOpen(true);
        }}
      />
      <MainHeaderAgentPickerSheet
        catalog={catalog}
        currentAgentId={header.agent?.id}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={header.selectAgent}
      />
    </>
  );
}
const ignorePending = () => {};
function RemoteChatSession() {
  const source = useRemoteConversationSource();
  const { availability } = useConversationSourceState();
  const target = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { draftId, identity, selectAgent, startNewChat, onSessionCreated } =
    useRemoteChatNavigation(target, source);
  const opened = useConversation(
    target.sessionId ? { source: source.ref, sessionId: target.sessionId } : undefined,
    source,
  );
  const snapshot = useConversationSnapshot(opened.session);
  const history = useConversationHistory(opened.session, snapshot.historyVersion);
  // The presenter retains live rows until the desktop's history revision installs them.
  const [presentation, setPresentation] = useState(() => ({
    session: opened.session,
    presenter: new ConversationPresenter(),
  }));
  let presenter = presentation.presenter;
  if (presentation.session !== opened.session) {
    presenter = new ConversationPresenter();
    setPresentation({ session: opened.session, presenter });
  }
  const messages = presenter.update(
    snapshot,
    history.messages,
    history.installedVersion,
    history.hasNewerMessages,
  );
  const session = opened.session;
  const shareMessage = useCallback(
    (messageId: string) => {
      if (session) router.push(conversationShareHref(session.ref, messageId, session.scope));
    },
    [session],
  );
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
  const draftKey = `${source.draftScope}:${target.connectionId}:${target.sessionId ? `session:${target.sessionId}` : identity}`;
  const [drafts] = usePersistCache('remote_agent.drafts');
  return (
    <HeaderContext value={{ agent, selectAgent, startNewChat }}>
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
                renderUsage={renderRemoteUsage}
                messages={messages}
                onShare={opened.session ? shareMessage : undefined}
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
              {/* Agent-scoped workspace controls reset; the user's composer above stays mounted. */}
              <RemoteComposer
                key={agent?.ref}
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
