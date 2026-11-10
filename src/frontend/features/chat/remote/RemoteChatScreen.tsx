import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useLocalSearchParams } from 'expo-router';
import {
  type RefObject,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View, type ViewInstance } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackgroundTaskNotifications } from '@/frontend/appShell/backgroundActivity';
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
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
  useChatSource,
} from '@/frontend/appShell/navigation/chat';
import { useSidebarPresence } from '@/frontend/appShell/sidebar';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
} from '@/frontend/components/Composer';
import { ConversationStatus } from '@/frontend/components/ConversationStatus';
import type { MessageListItem } from '@/frontend/components/Message';
import { useBackendModule } from '@/frontend/data';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { ChatWorkspace, RemoteAssistantMessageUsage } from '../components/ChatWorkspace';
import { ChatShareComposerGuard, ChatShareSelectionControls } from '../share/ChatShareControls';
import { ChatShareSelectionProvider } from '../share/ChatShareSelectionProvider';
import type { ChatShareTarget } from '../share/chatShareTarget';
import { ConversationPresenter } from './ConversationPresenter';
import { RemoteComposer } from './RemoteComposer';
import { useRemoteChatNavigation } from './useRemoteChatNavigation';
import { readRemoteDraft } from './useRemoteDraftPersistence';

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
              onPress: () => router.replace('/settings/device-connections/scan'),
            }}
          />
        )}
      </View>
    </ChatScreenFrame>
  );
}
function UnresolvedRemoteHeader({ blurTarget }: { blurTarget: RefObject<ViewInstance | null> }) {
  const { startRemoteChat } = useChatSource();
  return <MainHeaderView blurTarget={blurTarget} onNewChat={() => startRemoteChat()} />;
}

const HeaderContext = createContext<{
  agent?: AgentSummary;
  selectAgent(agentId: string): void;
  startNewChat(agentId?: string): void;
} | null>(null);
function RemoteHeader({
  blurTarget,
  hidden,
  selection,
}: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  selection?: { selectedCount: number; onExit(): void };
}) {
  const header = use(HeaderContext)!;
  const catalog = useConversationAgents();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <MainHeaderView
        agent={header.agent}
        blurTarget={blurTarget}
        hidden={hidden}
        selection={selection}
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
  const sidebarPresence = useSidebarPresence();
  const source = useRemoteConversationSource();
  const connectionId = source.ref.kind === 'desktop' ? source.ref.connectionId : undefined;
  const { availability } = useConversationSourceState();
  const desktopConnections = useBackendModule('desktopConnections');
  const target = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const composerHeight = useSharedValue(0);
  const setComposerHeight = useCallback(
    (height: number) => composerHeight.set(height),
    [composerHeight],
  );
  const { draftId, identity, selectAgent, startNewChat, onSessionCreated } =
    useRemoteChatNavigation(target, source);
  const opened = useConversation(
    target.sessionId ? { source: source.ref, sessionId: target.sessionId } : undefined,
    source,
  );
  useBackgroundTaskNotifications(
    connectionId && target.sessionId
      ? { kind: 'remote-chat', connectionId, sessionId: target.sessionId }
      : undefined,
    sidebarPresence !== 'open',
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
  const shareTarget = useMemo<ChatShareTarget | undefined>(
    () =>
      session
        ? {
            ref: session.ref,
            prepareSelection: (ids, signal) => session.history.prepareSelection(ids, signal),
            readSelectableIds: async (signal) => {
              const window = await session.history.openLatest(signal);
              try {
                const ids: string[] = [];
                let page = window.initial;
                while (true) {
                  ids.unshift(
                    ...page.items
                      .filter(
                        (message) =>
                          message.completeness === 'complete' &&
                          message.display.role !== 'system' &&
                          !['pending', 'streaming'].includes(message.state),
                      )
                      .map((message) => message.key),
                  );
                  if (!page.older || ids.length > DOCUMENT_EXPORT_MAX_SECTIONS) return ids;
                  page = await window.read(page.older, signal);
                }
              } finally {
                window.dispose();
              }
            },
          }
        : undefined,
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
  return (
    // oxlint-disable-next-line react/jsx-no-constructed-context-values -- Preserve current header updates; memoization needs consumer-cost evidence.
    <HeaderContext value={{ agent, selectAgent, startNewChat }}>
      <ChatScreenFrame header={RemoteHeader}>
        <ChatShareSelectionProvider target={shareTarget} messages={messages}>
          <ComposerSessionProvider
            key={`${source.scope}:${identity}`}
            initialDraft={() => readRemoteDraft(draftKey)}
          >
            {/* Native background taps yield to scrolling and excluded message content. */}
            <ComposerDismissArea testID="chat-background">
              {opened.error ? (
                <ContentState.Error
                  title={t('remoteAgent.loadFailed')}
                  primaryAction={{ children: t('common.retry'), onPress: opened.retry }}
                />
              ) : (
                <ChatWorkspace
                  executionSource="desktop"
                  feedbackHintBottomOffset={composerHeight}
                  renderUsage={renderRemoteUsage}
                  messages={messages}
                  snapshot={snapshot}
                  messageWindow={history}
                  sessionId={target.sessionId}
                  assistantEmoji={agent?.emoji}
                  assistantName={agent?.name}
                  isAssistantToolbarEnabled
                  contentBottomInset={composerContentGap}
                  keyboardOffset={getComposerKeyboardStickyOffset(bottom)}
                  onPendingSendDisplayed={ignorePending}
                />
              )}
            </ComposerDismissArea>
            <ChatShareComposerGuard>
              <ComposerDock
                backgroundClassName="bg-chat-background"
                layoutMode="expandable-overlay"
                onHeightChange={setComposerHeight}
              >
                <View>
                  <ConversationStatus
                    availability={availability}
                    onRepair={() => router.push('/settings/device-connections')}
                    onReconnect={
                      connectionId ? () => desktopConnections.reconnect(connectionId) : undefined
                    }
                    onOpenDeviceSettings={
                      connectionId
                        ? () =>
                            router.push({
                              pathname: '/settings/device-connections/[connectionId]',
                              params: { connectionId },
                            })
                        : undefined
                    }
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
            </ChatShareComposerGuard>
            <ChatShareSelectionControls />
          </ComposerSessionProvider>
        </ChatShareSelectionProvider>
      </ChatScreenFrame>
    </HeaderContext>
  );
}
