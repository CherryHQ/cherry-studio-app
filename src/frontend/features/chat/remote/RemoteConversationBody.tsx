import {
  composerContentGap,
  ContentState,
  getComposerBottomPadding,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { type ComponentProps, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type AgentSummary,
  type ConversationRef,
  useConversationSourceState,
  type useConversationAgents,
} from '@/frontend/appShell/conversation';
import {
  type DraftId,
  type RemoteConversationSource,
  type useConversation,
  useConversationHistory,
  useConversationSnapshot,
} from '@/frontend/appShell/conversation/remote';
import type { RemoteChatTarget } from '@/frontend/appShell/navigation/chat';
import { useNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
  getComposerExtraBottomOffset,
} from '@/frontend/components/Composer';
import { ConversationStatus } from '@/frontend/components/ConversationStatus';
import type { MessageListItem } from '@/frontend/components/Message';
import { useBackendModule } from '@/frontend/data';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { ChatWorkspace, RemoteAssistantMessageUsage } from '../components/ChatWorkspace';
import { ChatShareComposerGuard, ChatShareSelectionControls } from '../share/ChatShareControls';
import { ChatShareSelectionProvider } from '../share/ChatShareSelectionProvider';
import { ConversationPresenter } from './ConversationPresenter';
import { remoteChatShareTarget } from './remoteChatShareTarget';
import { RemoteComposer } from './RemoteComposer';
import { useRemoteChatTurns } from './useRemoteChatTurns';
import { readRemoteDraft } from './useRemoteDraftPersistence';

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
    onSessionCreated?(ref: ConversationRef): boolean;
    agents: ReturnType<typeof useConversationAgents>;
    surface?: 'default' | 'sheet';
  }) {
  const isSheet = surface === 'sheet';
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

  return (
    <ChatScreenFrame header={header} headerPlacement={headerPlacement} surface={surface}>
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
                isAssistantToolbarEnabled
                contentBottomInset={composerContentGap}
                keyboardOffset={
                  isSheet ? undefined : getComposerKeyboardStickyOffset(bottom) + extraBottomOffset
                }
                onPendingSendDisplayed={ignorePending}
              />
            )}
          </ComposerDismissArea>
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
              </View>
            </ComposerDock>
          </ChatShareComposerGuard>
          <ChatShareSelectionControls />
        </ComposerSessionProvider>
      </ChatShareSelectionProvider>
    </ChatScreenFrame>
  );
}
