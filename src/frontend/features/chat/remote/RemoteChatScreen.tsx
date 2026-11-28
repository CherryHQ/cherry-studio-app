import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useIsFocused, useIsPreview, useLocalSearchParams } from 'expo-router';
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
import { Keyboard, View, type ViewInstance } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackgroundTaskNotifications } from '@/frontend/appShell/backgroundActivity';
import {
  type AgentRef,
  type AgentSummary,
  type WorkspaceSummary,
  ConversationSourceBoundary,
  useConversationAgents,
  useConversationSourceState,
  useConversationWorkspaces,
} from '@/frontend/appShell/conversation';
import {
  useConversation,
  useConversationDraft,
  useConversationHistory,
  useConversationSnapshot,
  useRemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import { MainHeaderView } from '@/frontend/appShell/header';
import {
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
  type RemoteChatTarget,
  useChatSource,
} from '@/frontend/appShell/navigation/chat';
import { useNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';
import { useSidebarPresence } from '@/frontend/appShell/sidebar';
import { AgentPickerSheet } from '@/frontend/components/AgentPicker';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerDropArea,
  ComposerSessionProvider,
  getComposerExtraBottomOffset,
} from '@/frontend/components/Composer';
import { ConversationStatus } from '@/frontend/components/ConversationStatus';
import type { MessageListItem } from '@/frontend/components/Message';
import { useBackendModule } from '@/frontend/data';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import {
  ChatComposerClearance,
  ChatWorkspace,
  RemoteAssistantMessageUsage,
} from '../components/ChatWorkspace';
import { FullScreenLayerHost } from '../components/FullScreenLayer';
import { ChatShareComposerGuard, ChatShareSelectionControls } from '../share/ChatShareControls';
import { ChatShareSelectionProvider } from '../share/ChatShareSelectionProvider';
import { ConversationPresenter } from './ConversationPresenter';
import { remoteChatShareTarget } from './remoteChatShareTarget';
import { RemoteComposer } from './RemoteComposer';
import { useRemoteChatNavigation } from './useRemoteChatNavigation';
import { useRemoteChatTurns } from './useRemoteChatTurns';
import { readRemoteDraft } from './useRemoteDraftPersistence';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;

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
      <RemoteChatRoute target={target} />
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
function UnresolvedRemoteHeader(props: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  selection?: { selectedCount: number; onExit(): void };
}) {
  const { startRemoteChat } = useChatSource();
  return <MainHeaderView {...props} onNewChat={() => startRemoteChat()} />;
}

const HeaderContext = createContext<{
  agent?: AgentSummary;
  agents: ReturnType<typeof useConversationAgents>;
  navigation?: ReturnType<typeof useRemoteChatNavigation>;
} | null>(null);
function RemoteHeader(props: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  selection?: { selectedCount: number; onExit(): void };
}) {
  const { agent, agents, navigation } = use(HeaderContext)!;
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!navigation) return <MainHeaderView {...props} agent={agent} />;
  return (
    <>
      <MainHeaderView
        {...props}
        agent={agent}
        onNewChat={() => navigation.startNewChat(agent?.id)}
        onAgentPress={() => {
          Keyboard.dismiss();
          setPickerOpen(true);
        }}
      />
      <AgentPickerSheet
        testID="main-header-agent-picker"
        catalog={agents}
        currentAgentId={agent?.id}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={navigation.selectAgent}
      />
    </>
  );
}
const ignorePending = () => {};
function RemoteChatRoute({ target }: { target: RemoteChatTarget }) {
  const source = useRemoteConversationSource();
  const navigation = useRemoteChatNavigation(target, source);
  const opened = useConversation(
    target.sessionId ? { source: source.ref, sessionId: target.sessionId } : undefined,
    source,
  );
  return <RemoteChatSession target={target} opened={opened} navigation={navigation} />;
}

type RemoteChatSessionProps = { opened: ReturnType<typeof useConversation> } & (
  | { target: RemoteChatTarget; navigation: ReturnType<typeof useRemoteChatNavigation> }
  | { target: RemoteChatTarget & { sessionId: string }; navigation?: never }
);

export function RemoteChatSession({ target, opened, navigation }: RemoteChatSessionProps) {
  const isPreview = useIsPreview();
  const isFocused = useIsFocused() && !isPreview;
  const sidebarPresence = useSidebarPresence();
  const source = useRemoteConversationSource();
  const connectionId = source.ref.kind === 'desktop' ? source.ref.connectionId : undefined;
  const { availability } = useConversationSourceState();
  const desktopConnections = useBackendModule('desktopConnections');
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const dockClearance = useNavigationDockClearance();
  const extraBottomOffset = getComposerExtraBottomOffset(bottom, dockClearance);
  const composerHeight = useSharedValue(0);
  const setComposerHeight = useCallback(
    (height: number) => composerHeight.set(height),
    [composerHeight],
  );
  useBackgroundTaskNotifications(
    connectionId && target.sessionId
      ? { kind: 'remote-chat', connectionId, sessionId: target.sessionId }
      : undefined,
    sidebarPresence !== 'open',
  );
  const snapshot = useConversationSnapshot(opened.session);
  const turns = useRemoteChatTurns(opened.session, snapshot.historyVersion);
  const history = useConversationHistory(opened.session, snapshot.historyVersion, turns.navigation);
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
  const shareTarget = useMemo(
    () => (session ? remoteChatShareTarget(session) : undefined),
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
  const existing = Boolean(target.sessionId);
  const draftId = existing ? undefined : navigation?.draftId;
  const workspaces = useConversationWorkspaces(agent?.ref);
  const [workspaceSelection, setWorkspaceSelection] = useState<{
    agentRef?: AgentRef;
    workspace?: WorkspaceSummary;
  }>(() => ({ agentRef: agent?.ref }));
  if (workspaceSelection.agentRef !== agent?.ref) {
    setWorkspaceSelection({ agentRef: agent?.ref, workspace: undefined });
  }
  const selectedAgentWorkspace =
    workspaceSelection.agentRef === agent?.ref ? workspaceSelection.workspace : undefined;
  const selectedWorkspace = existing
    ? workspaces.items.find((item) => item.kind !== 'system' && item.id === snapshot.workspaceId)
    : (workspaces.items.find((item) => item.ref === selectedAgentWorkspace?.ref) ??
      (!selectedAgentWorkspace
        ? workspaces.items.find((item) => item.kind === 'system')
        : undefined));
  const selectWorkspace = useCallback(
    (workspace: WorkspaceSummary) => setWorkspaceSelection({ agentRef: agent?.ref, workspace }),
    [agent?.ref],
  );
  const draft = useConversationDraft(agent?.ref, selectedWorkspace?.ref, draftId);
  const preparation = existing
    ? snapshot.attachmentPreparation
    : draft.state?.attachmentPreparation;
  const inputAllowsAttachments =
    (existing ? snapshot.actions.inputPolicy : draft.state?.inputPolicy)?.attachments === true;
  const supportsAttachments = inputAllowsAttachments && Boolean(preparation);
  const hasAgentsError = !existing && agents.isError;
  const hasNoAgents = !existing && agents.isSuccess && !agents.items.length;
  const hasComposer = !isPreview && !opened.error && !hasAgentsError && !hasNoAgents;
  const contentBottomInset = hasComposer ? composerContentGap : PREVIEW_CONTENT_BOTTOM_INSET;
  const keyboardOffset = hasComposer
    ? getComposerKeyboardStickyOffset(bottom) + extraBottomOffset
    : 0;
  const conversationStatus = (
    <ConversationStatus
      availability={availability}
      onRepair={() => router.push('/settings/device-connections')}
      onReconnect={connectionId ? () => desktopConnections.reconnect(connectionId) : undefined}
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
  );
  const sessionKey = `session:${target.sessionId}`;
  const identity = navigation?.identity ?? sessionKey;
  const draftKey = `${source.draftScope}:${target.connectionId}:${target.sessionId ? sessionKey : identity}`;
  return (
    // oxlint-disable-next-line react/jsx-no-constructed-context-values -- Preserve current header updates; memoization needs consumer-cost evidence.
    <HeaderContext value={{ agent, agents, navigation }}>
      <ChatScreenFrame header={RemoteHeader}>
        <ChatShareSelectionProvider target={shareTarget} messages={messages}>
          <ComposerSessionProvider
            key={`${source.scope}:${identity}`}
            initialDraft={() => readRemoteDraft(draftKey)}
            isFocused={isFocused}
          >
            <ComposerDropArea enabled={hasComposer && supportsAttachments}>
              <FullScreenLayerHost>
                {/* Native background taps yield to scrolling and excluded message content. */}
                <ComposerDismissArea disabled={!hasComposer} testID="chat-background">
                  {opened.error ? (
                    <ChatComposerClearance className="flex-1">
                      <View className="flex-1 justify-center px-8 py-16">
                        <ContentState.Error
                          prominence="prominent"
                          title={t('remoteAgent.loadFailed')}
                          primaryAction={{ children: t('common.retry'), onPress: opened.retry }}
                        />
                      </View>
                    </ChatComposerClearance>
                  ) : hasAgentsError ? (
                    <ChatComposerClearance className="flex-1">
                      <View className="flex-1 justify-center px-8 py-16">
                        <ContentState.Error
                          prominence="prominent"
                          title={t('remoteAgent.loadFailed')}
                          primaryAction={{
                            children: t('common.retry'),
                            onPress: () => void agents.refetch(),
                          }}
                        />
                      </View>
                    </ChatComposerClearance>
                  ) : hasNoAgents ? (
                    <ChatComposerClearance className="flex-1">
                      <View className="flex-1 justify-center px-8 py-16">
                        <ContentState.Empty title={t('remoteAgent.noAgents')} />
                      </View>
                    </ChatComposerClearance>
                  ) : (
                    <ChatWorkspace
                      executionSource="desktop"
                      turnNavigator={turns.navigator}
                      isTranslationEnabled={Boolean(opened.session?.readingAidScope)}
                      readingAidScope={opened.session?.readingAidScope}
                      feedbackHintBottomOffset={composerHeight}
                      renderUsage={renderRemoteUsage}
                      messages={messages}
                      snapshot={snapshot}
                      messageWindow={history}
                      connectionId={connectionId}
                      sessionId={target.sessionId}
                      assistantEmoji={agent?.emoji}
                      assistantName={agent?.name}
                      isAssistantToolbarEnabled={!isPreview}
                      contentBottomInset={contentBottomInset}
                      keyboardOffset={keyboardOffset}
                      onPendingSendDisplayed={ignorePending}
                    />
                  )}
                </ComposerDismissArea>
              </FullScreenLayerHost>
              {!hasComposer && availability.state !== 'enabled' ? (
                <View style={{ paddingBottom: extraBottomOffset }}>{conversationStatus}</View>
              ) : null}
              {hasComposer ? (
                <ChatShareComposerGuard>
                  <ComposerDock
                    backgroundClassName="bg-chat-background"
                    layoutMode="expandable-overlay"
                    onHeightChange={setComposerHeight}
                  >
                    <View>
                      {conversationStatus}
                      {/* Agent-scoped workspace controls reset; the user's composer above stays mounted. */}
                      <RemoteComposer
                        key={agent?.ref}
                        session={opened.session}
                        snapshot={snapshot}
                        draftId={draftId}
                        draftKey={draftKey}
                        draft={draft}
                        workspaces={workspaces}
                        selectedWorkspace={selectedWorkspace}
                        supportsAttachments={supportsAttachments}
                        onSelectWorkspace={selectWorkspace}
                        onSessionCreated={navigation?.onSessionCreated}
                      />
                    </View>
                  </ComposerDock>
                </ChatShareComposerGuard>
              ) : null}
              <ChatShareSelectionControls />
            </ComposerDropArea>
          </ComposerSessionProvider>
        </ChatShareSelectionProvider>
      </ChatScreenFrame>
    </HeaderContext>
  );
}
