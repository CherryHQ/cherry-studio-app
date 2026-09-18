import {
  Button,
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainHeaderView } from '@/frontend/appShell/header';
import { ChatDockFooter } from '@/frontend/appShell/layout';
import {
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
  useChatSource,
} from '@/frontend/appShell/navigation/chat';
import {
  RemoteAgentProvider,
  RemoteConnectionBanner,
  useRemoteAgent,
  useRemoteAgents,
  useRemoteConnection,
} from '@/frontend/appShell/remoteAgent';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
} from '@/frontend/components/Composer';
import { type MessageListItem } from '@/frontend/components/Message';
import { usePersistCache } from '@/frontend/data/hooks';
import type { ControllerAgent } from '@/shared/contracts/agent/controller';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { ChatDraftState } from '../components/ChatWorkspace';
import { ChatTranscript } from '../components/ChatWorkspace/ChatTranscript';
import { ChatMessage } from '../components/ChatWorkspace/components/ChatMessage';
import { ChatMessageActionsProvider } from '../components/ChatWorkspace/context/AssistantMessageActionsProvider';
import { useIsScreenReaderEnabled } from '../components/ChatWorkspace/hooks/useIsScreenReaderEnabled';
import { getTimestampMessageIds } from '../components/ChatWorkspace/messageTimestamps';
import { RemoteActions } from './RemoteActions';
import { RemoteChatMessage } from './RemoteChatMessage';
import { RemoteComposer, type RemotePendingSend } from './RemoteComposer';
import { RemoteInteractionSheet } from './RemoteInteractionSheet';
import { RemoteMessageDetails } from './RemoteMessageDetails';
import type { PresentedMessage } from './remoteMessagePresentation';
import { useRemoteConversation } from './useRemoteConversation';

export function RemoteChatScreen() {
  const remoteTarget = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  return remoteTarget.connectionId ? (
    <RemoteAgentProvider
      key={remoteTarget.connectionId}
      connectionId={remoteTarget.connectionId}
      renderFallback={(state) => <RemoteChatUnavailable state={state} />}
    >
      <RemoteChatSession />
    </RemoteAgentProvider>
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
function RemoteHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const { t } = useTranslation();
  const remoteTarget = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  const { startRemoteChat } = useChatSource();
  const agents = useRemoteAgents();
  const agent =
    agents.agents.find((item) => item.id === remoteTarget.agentId) ??
    (!remoteTarget.agentId ? agents.agents[0] : undefined);
  return (
    <MainHeaderView
      agent={
        agent ?? (remoteTarget.agentId ? { name: t('chat.backgroundReply.assistant') } : undefined)
      }
      blurTarget={blurTarget}
      onNewChat={() => startRemoteChat(agent?.id ?? remoteTarget.agentId)}
    />
  );
}

function RemoteChatSession() {
  const { t } = useTranslation();
  const remoteTarget = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  const { openRemote } = useChatSource();
  const { connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const agents = useRemoteAgents();
  const agent =
    agents.agents.find((item) => item.id === remoteTarget.agentId) ??
    (!remoteTarget.agentId ? agents.agents[0] : undefined);
  // A selected Agent may be on a later PC page. Never substitute a different Agent.
  useEffect(() => {
    if (
      remoteTarget.agentId &&
      !agent &&
      agents.hasNextPage &&
      !agents.isFetchingNextPage &&
      !agents.isError
    )
      void agents.fetchNextPage();
  }, [remoteTarget.agentId, agent, agents]);
  const focused = useRef(false);
  const deferredHandoff = useRef<{ key: string; sessionId: string; agentId: string } | undefined>(
    undefined,
  );
  const [handoff, setHandoff] = useState<{ key: string; sessionId: string }>();
  const [drafts] = usePersistCache('remote_agent.drafts');
  const draftKey = `draft:${remoteTarget.draftId ?? remoteTarget.agentId ?? 'default'}`;
  const key = remoteTarget.sessionId
    ? handoff?.sessionId === remoteTarget.sessionId
      ? handoff.key
      : remoteTarget.sessionId
    : draftKey;
  const onSessionCreated = (sessionId: string, agentId: string) => {
    if (!focused.current) {
      deferredHandoff.current = { key, sessionId, agentId };
      return;
    }
    setHandoff({ key, sessionId });
    openRemote({ connectionId, agentId, sessionId });
  };
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const deferred = deferredHandoff.current;
      deferredHandoff.current = undefined;
      if (deferred?.key === key) {
        setHandoff({ key, sessionId: deferred.sessionId });
        openRemote({ connectionId, agentId: deferred.agentId, sessionId: deferred.sessionId });
      }
      return () => {
        focused.current = false;
      };
    }, [key, connectionId, openRemote]),
  );
  if (!remoteTarget.sessionId && !agent)
    return (
      <ChatScreenFrame header={RemoteHeader}>
        <View className="flex-1 justify-center px-8 py-16">
          {agents.isError ? (
            <ContentState.Error
              title={t('remoteAgent.loadFailed')}
              primaryAction={{ children: t('common.retry'), onPress: () => void agents.refetch() }}
            />
          ) : agents.isLoading ? (
            <ContentState.Loading title={t('remoteAgent.loading')} />
          ) : (
            <ContentState.Empty title={t('remoteAgent.noAgents')} />
          )}
          {connection.status !== 'ready' ? <RemoteConnectionBanner /> : null}
        </View>
      </ChatScreenFrame>
    );
  return (
    <ChatScreenFrame header={RemoteHeader}>
      <ComposerSessionProvider
        key={`${connectionId}:${connection.sourceKey}:${key}`}
        initialDraft={
          drafts[`${connectionId}:${connection.sourceKey}:${remoteTarget.sessionId ?? draftKey}`] ??
          ''
        }
      >
        <RemoteConversation
          agent={agent}
          sessionId={remoteTarget.sessionId}
          draftKey={draftKey}
          conversationKey={key}
          onSessionCreated={onSessionCreated}
        />
      </ComposerSessionProvider>
    </ChatScreenFrame>
  );
}

function RemoteConversation({
  agent,
  sessionId,
  draftKey,
  conversationKey,
  onSessionCreated,
}: {
  agent?: ControllerAgent;
  sessionId?: string;
  draftKey: string;
  conversationKey: string;
  onSessionCreated(sessionId: string, agentId: string): void;
}) {
  const { t } = useTranslation();
  const { connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const queryClient = useQueryClient();
  const { history, messages, snapshot } = useRemoteConversation(sessionId);
  const [pending, setPending] = useState<RemotePendingSend>();
  const hasPendingSend = Boolean(
    pending &&
    (!pending.messageId || !messages.some((message) => message.id === pending.messageId)),
  );
  const displayedMessages: readonly MessageListItem[] =
    pending && hasPendingSend
      ? [
          ...messages,
          {
            id: pending.messageId ?? `pending-user:${pending.id}`,
            role: 'user',
            createdAt: pending.createdAt,
            status: 'pending',
            data: { parts: [{ type: 'text', text: pending.text }] },
          },
          { id: `pending-assistant:${pending.id}`, role: 'assistant', status: 'pending', data: {} },
        ]
      : messages;
  const [interactionId, setInteractionId] = useState<string>();
  const [detailsId, setDetailsId] = useState<string>();
  const { bottom } = useSafeAreaInsets();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const timestamps = getTimestampMessageIds(displayedMessages);
  const current = Boolean(snapshot?.current) && connection.status === 'ready';
  const presentation = { name: agent?.name ?? t('chat.backgroundReply.assistant') };
  const sharing = useRef(false);
  useFocusEffect(
    useCallback(() => {
      sharing.current = false;
    }, []),
  );
  const share = ({ messageId }: { messageId: string }) => {
    if (!sessionId || sharing.current) return;
    sharing.current = true;
    Keyboard.dismiss();
    router.push({
      pathname: '/chat-share',
      params: {
        connectionId,
        sourceKey: connection.sourceKey,
        sessionId,
        agentId: snapshot?.session.agentId ?? agent?.id,
        messageId,
      },
    });
  };
  const renderMessage = (message: MessageListItem) =>
    sessionId && 'remote' in message ? (
      <RemoteChatMessage
        assistantPresentation={presentation}
        isScreenReaderEnabled={isScreenReaderEnabled}
        message={message as PresentedMessage}
        sessionId={sessionId}
        shouldShowTimestamp={timestamps.has(message.id)}
        onDetails={setDetailsId}
        current={current}
      />
    ) : (
      <ChatMessage
        assistantPresentation={presentation}
        isMessageActionsEnabled
        isScreenReaderEnabled={isScreenReaderEnabled}
        message={message}
        shouldShowTimestamp={timestamps.has(message.id)}
        usage={null}
      />
    );
  const selectedInteraction = snapshot?.interactions.find((item) => item.id === interactionId);
  return (
    <>
      <ComposerDismissArea disabled testID="chat-background">
        {!sessionId && !hasPendingSend ? (
          <ChatDraftState assistantName={agent?.name} contentBottomInset={composerContentGap} />
        ) : history.isError && !messages.length ? (
          <View className="flex-1 justify-center px-8 py-16">
            <ContentState.Error
              title={t('chat.history.loadFailed')}
              primaryAction={{ children: t('common.retry'), onPress: () => void history.refetch() }}
            />
          </View>
        ) : (
          <ChatMessageActionsProvider isAssistantToolbarEnabled onShare={share}>
            <ChatTranscript
              messages={displayedMessages.filter((message) => message.role !== 'system')}
              renderMessage={renderMessage}
              extraData={{ presentation, timestamps, current, isScreenReaderEnabled }}
              dataKey={`pc:${connectionId}:${connection.sourceKey}:${conversationKey}`}
              contentBottomInset={composerContentGap}
              keyboardOffset={getComposerKeyboardStickyOffset(bottom)}
              keyboardShouldPersistTaps="always"
              requiresInitialLayout={!hasPendingSend && (history.isLoading || messages.length > 0)}
              initialLayoutReady={hasPendingSend || !history.isLoading}
              isLoadingMore={history.isFetchingNextPage}
              onLoadOlder={
                history.hasNextPage && !history.isFetchingNextPage
                  ? async () => {
                      await history.fetchNextPage();
                    }
                  : undefined
              }
            />
          </ChatMessageActionsProvider>
        )}
      </ComposerDismissArea>
      <ComposerDock layoutMode="flow">
        <View>
          {connection.status !== 'ready' ? <RemoteConnectionBanner /> : null}
          <View className="max-h-36">
            <ScrollView keyboardShouldPersistTaps="handled">
              <RemoteActions agentId={agent?.id} sessionId={sessionId} />
              {snapshot?.interactions.map((interaction) => (
                <Button
                  key={interaction.id}
                  variant="outline"
                  onPress={() => setInteractionId(interaction.id)}
                >
                  {t('remoteAgent.interaction', { name: interaction.toolName })}
                </Button>
              ))}
            </ScrollView>
          </View>
          <RemoteComposer
            agent={agent}
            sessionId={sessionId}
            draftKey={draftKey}
            snapshot={snapshot}
            onSessionCreated={(id, agentId) => {
              onSessionCreated(id, agentId);
              void queryClient.invalidateQueries({
                queryKey: ['agentController', connectionId, connection.sourceKey, 'sessions'],
              });
            }}
            onPendingSend={setPending}
            hasPendingSend={hasPendingSend}
          />
          <ChatDockFooter>
            <Text className="text-center text-xs text-muted-foreground">
              {agent?.availability === 'model-missing'
                ? t('agent.model.none')
                : t('chat.input.disclaimer')}
            </Text>
          </ChatDockFooter>
        </View>
      </ComposerDock>
      {sessionId && interactionId ? (
        <RemoteInteractionSheet
          key={interactionId}
          sessionId={sessionId}
          interaction={
            selectedInteraction
              ? { ...selectedInteraction, canRespond: selectedInteraction.canRespond && current }
              : {
                  id: interactionId,
                  toolName: t('remoteAgent.interactionResolved'),
                  canRespond: false,
                }
          }
          onClose={() => setInteractionId(undefined)}
        />
      ) : null}
      {sessionId && detailsId ? (
        <RemoteMessageDetails
          sessionId={sessionId}
          messageId={detailsId}
          onClose={() => setDetailsId(undefined)}
        />
      ) : null}
    </>
  );
}
