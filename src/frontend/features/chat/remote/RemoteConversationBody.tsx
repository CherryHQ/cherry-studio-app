import {
  composerContentGap,
  ContentState,
  getComposerBottomPadding,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useIsFocused, useIsPreview } from 'expo-router';
import { type ComponentProps, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type AgentRef,
  type AgentSummary,
  type WorkspaceSummary,
  type useConversationAgents,
  useConversationSourceState,
  useConversationWorkspaces,
} from '@/frontend/appShell/conversation';
import {
  type DraftId,
  type RemoteDraftHandoff,
  type RemoteConversationSource,
  type useConversation,
  useConversationDraft,
  useConversationHistory,
  useConversationSnapshot,
} from '@/frontend/appShell/conversation/remote';
import type { RemoteChatTarget } from '@/frontend/appShell/navigation/chat';
import { useNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';
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
import { useRemoteChatTurns } from './useRemoteChatTurns';
import { readRemoteDraft, useRemoteDraftModel } from './useRemoteDraftPersistence';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;

const renderRemoteUsage = (message: MessageListItem) => (
  <RemoteAssistantMessageUsage message={message} />
);
const ignorePending = () => {};

export function useRemoteConversation(opened: ReturnType<typeof useConversation>) {
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
  return { opened, snapshot, turns, history, messages };
}

export function RemoteConversationBody({
  source,
  connectionId,
  target,
  opened,
  snapshot,
  turns,
  history,
  messages,
  agent,
  draftId,
  draftKey,
  identity,
  onSessionCreated,
  agents,
  header,
  headerPlacement,
  surface = 'default',
}: ReturnType<typeof useRemoteConversation> &
  Pick<ComponentProps<typeof ChatScreenFrame>, 'header' | 'headerPlacement'> & {
    source: RemoteConversationSource;
    connectionId?: string;
    target: RemoteChatTarget;
    agent?: AgentSummary;
    draftId?: DraftId;
    draftKey: string;
    identity: string;
    onSessionCreated?(created: RemoteDraftHandoff): boolean;
    agents: ReturnType<typeof useConversationAgents>;
    surface?: 'default' | 'sheet';
  }) {
  const isSheet = surface === 'sheet';
  const isPreview = useIsPreview();
  const isFocused = useIsFocused() && !isPreview;
  const { availability } = useConversationSourceState();
  const desktopConnections = useBackendModule('desktopConnections');
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const dockClearance = useNavigationDockClearance();
  const extraBottomOffset = getComposerExtraBottomOffset(bottom, dockClearance);
  const sheetKeyboardTracking = useSharedValue(false);
  const composerHeight = useSharedValue(0);
  const setComposerHeight = useCallback(
    (height: number) => composerHeight.set(height),
    [composerHeight],
  );
  const session = opened.session;
  const shareTarget = useMemo(
    () => (session ? remoteChatShareTarget(session) : undefined),
    [session],
  );
  const existing = Boolean(target.sessionId);
  const activeDraftId = existing ? undefined : draftId;
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
  const modelSelection = useRemoteDraftModel(draftKey, activeDraftId ? agent?.id : undefined);
  const draft = useConversationDraft(
    agent?.ref,
    selectedWorkspace?.ref,
    activeDraftId,
    modelSelection.model,
  );
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
  const keyboardOffset = isSheet
    ? undefined
    : hasComposer
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

  return (
    <ChatScreenFrame header={header} headerPlacement={headerPlacement} surface={surface}>
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
                    contentTopInset={headerPlacement === 'inline' ? 0 : undefined}
                    surface={surface}
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
              <View style={isSheet ? undefined : { paddingBottom: extraBottomOffset }}>
                {conversationStatus}
              </View>
            ) : null}
            {hasComposer ? (
              <ChatShareComposerGuard>
                <ComposerDock
                  backgroundClassName={isSheet ? undefined : 'bg-chat-background'}
                  {...(isSheet
                    ? { extraBottomOffset: 0, keyboardTracking: sheetKeyboardTracking }
                    : {})}
                  layoutMode="expandable-overlay"
                  onHeightChange={setComposerHeight}
                >
                  <View>
                    {isSheet ? (
                      <View
                        className="absolute -inset-x-4 top-6 bg-background dark:bg-popover"
                        pointerEvents="none"
                        style={{ bottom: -getComposerBottomPadding(bottom) }}
                      >
                        <View className="absolute inset-0 dark:bg-secondary" />
                      </View>
                    ) : null}
                    {conversationStatus}
                    {/* Agent-scoped workspace controls reset; the user's composer above stays mounted. */}
                    <RemoteComposer
                      key={agent?.ref}
                      session={opened.session}
                      snapshot={snapshot}
                      draftId={activeDraftId}
                      draftKey={draftKey}
                      agent={agent}
                      modelSelection={modelSelection}
                      draft={draft}
                      workspaces={workspaces}
                      selectedWorkspace={selectedWorkspace}
                      supportsAttachments={supportsAttachments}
                      onSelectWorkspace={selectWorkspace}
                      onSessionCreated={onSessionCreated}
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
  );
}
