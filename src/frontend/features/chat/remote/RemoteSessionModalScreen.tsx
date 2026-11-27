import Maximize2Icon from '@cherrystudio/app-icons/icons/maximize-2';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { BottomSheetProvider, ContentState } from '@cherrystudio/ui/components';
import { router, useLocalSearchParams } from 'expo-router';
import { createContext, use, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type ConversationRef,
  ConversationSourceBoundary,
  useConversationSourceState,
  useResolvedConversationAgent,
} from '@/frontend/appShell/conversation';
import {
  useConversation,
  useRemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import {
  parseRemoteChatRoute,
  remoteChatHref,
  type RemoteChatRouteParams,
  type RemoteChatTarget,
} from '@/frontend/appShell/navigation/chat';
import { useDesktopConnection } from '@/frontend/hooks/useDesktopConnections';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { RemoteConversationBody, useRemoteConversation } from './RemoteConversationBody';

type SessionTarget = RemoteChatTarget & { connectionId: string; sessionId: string };

const ModalHeaderContext = createContext<{
  title?: string;
  connectionName?: string;
  status?: string;
  dotClassName?: string;
  expandTarget?: SessionTarget;
}>({});

export function RemoteSessionModalScreen() {
  const params = useLocalSearchParams<
    RemoteChatRouteParams & { operationId?: string | string[] }
  >();
  const target = parseRemoteChatRoute(params);
  const { connectionId, sessionId, draftId } = target;
  if (!connectionId || (!sessionId && !draftId)) return <ModalContentState state="missing" />;

  return (
    // Keep approval and question sheets above this native modal's own view controller.
    <BottomSheetProvider>
      <ConversationSourceBoundary
        key={connectionId}
        source={{ kind: 'desktop', connectionId }}
        fallback={renderModalFallback}
      >
        {sessionId ? (
          <RemoteSession target={{ ...target, connectionId, sessionId }} />
        ) : (
          <PendingDispatch
            target={{ ...target, connectionId, draftId: draftId! }}
            operationId={getSingleRouteParam(params.operationId)}
          />
        )}
      </ConversationSourceBoundary>
    </BottomSheetProvider>
  );
}

function renderModalFallback(state: 'loading' | 'error') {
  return <ModalContentState state={state} />;
}

function PendingDispatch({
  target,
  operationId,
}: {
  target: RemoteChatTarget & { connectionId: string; draftId: string };
  operationId?: string;
}) {
  const source = useRemoteConversationSource();
  const { availability } = useConversationSourceState();
  const getReceipt = useCallback(
    () => source.getDispatch(target.draftId, operationId),
    [source, target.draftId, operationId],
  );
  const receipt = useSyncExternalStore(source.subscribeDispatches, getReceipt, getReceipt);
  if (!receipt) return <ModalContentState state="missing" />;
  if (receipt.status === 'rejected' || receipt.status === 'interrupted')
    return <ModalContentState state="failed" />;
  if (receipt.sessionId)
    return <RemoteSession target={{ ...target, sessionId: receipt.sessionId }} />;
  return (
    <ModalContentState
      state={
        availability.state === 'disabled' && availability.reason !== 'synchronizing'
          ? 'offline'
          : 'pending'
      }
    />
  );
}

function ModalContentState({
  state,
}: {
  state: 'missing' | 'loading' | 'error' | 'pending' | 'offline' | 'failed';
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-chat-background">
      <ModalHeader />
      <View className="flex-1 justify-center px-8">
        {state === 'loading' ? (
          <ContentState.Loading title={t('remoteAgent.connecting')} />
        ) : state === 'pending' ? (
          <ContentState.Loading title={t('desktopDispatch.pip.status.pending-confirm')} />
        ) : state === 'missing' ? (
          <ContentState.Empty title={t('desktopDispatch.modal.sessionUnavailable')} />
        ) : (
          <ContentState.Error
            title={t(
              state === 'offline'
                ? 'desktopDispatch.pip.status.offline'
                : state === 'failed'
                  ? 'desktopDispatch.pip.status.failed'
                  : 'remoteAgent.loadFailed',
            )}
          />
        )}
      </View>
    </View>
  );
}

function RemoteSession({ target }: { target: SessionTarget }) {
  const { t } = useTranslation();
  const { connectionId, sessionId } = target;
  const source = useRemoteConversationSource();
  const { availability } = useConversationSourceState();
  const opened = useConversation({ source: source.ref, sessionId }, source);
  const conversation = useRemoteConversation(opened);
  const { snapshot } = conversation;
  const { agent, agents } = useResolvedConversationAgent(snapshot.agentId ?? target.agentId, false);
  const { connection } = useDesktopConnection(connectionId);
  const identity = `session:${sessionId}`;

  let status = t('desktopDispatch.modal.status.connected');
  let dotClassName = 'bg-primary';
  if (availability.state === 'disabled') {
    status = t(
      availability.reason === 'synchronizing'
        ? 'remoteAgent.connecting'
        : 'remoteAgent.disconnected',
    );
    dotClassName = 'bg-muted-foreground';
  } else if (opened.isLoading) {
    status = t('remoteAgent.connecting');
    dotClassName = 'bg-muted-foreground';
  } else if (
    snapshot.interactions.some((interaction) => interaction.state === 'pending') ||
    snapshot.executions.some(
      ({ state }) => state === 'awaiting-approval' || state === 'awaiting-input',
    )
  ) {
    status = t('desktopDispatch.pip.status.awaiting-approval');
    dotClassName = 'bg-warning';
  } else if (
    snapshot.executions.some(({ state }) => state === 'running' || state === 'finalizing')
  ) {
    status = t('desktopDispatch.pip.status.running');
  }

  const confirmedSessionId = opened.session?.ref.sessionId ?? sessionId;
  const agentId = agent?.id ?? target.agentId;
  const title = agent?.name || snapshot.title;
  const connectionName = connection?.name;
  const header = useMemo(
    () => ({
      title,
      connectionName,
      status,
      dotClassName,
      expandTarget: { connectionId, sessionId: confirmedSessionId, agentId },
    }),
    [title, connectionName, status, dotClassName, connectionId, confirmedSessionId, agentId],
  );
  const onSessionCreated = (ref: ConversationRef) => {
    router.setParams({ sessionId: ref.sessionId, draftId: undefined });
    return true;
  };

  return (
    <ModalHeaderContext value={header}>
      <RemoteConversationBody
        {...conversation}
        source={source}
        connectionId={connectionId}
        target={target}
        agent={agent}
        agents={agents}
        draftKey={`${source.draftScope}:${connectionId}:${identity}`}
        identity={identity}
        onSessionCreated={onSessionCreated}
        header={ModalHeader}
        headerPlacement="inline"
      />
    </ModalHeaderContext>
  );
}

function closeModal() {
  if (router.canDismiss()) router.dismiss();
  else router.back();
}

function expandModal(target: SessionTarget) {
  Keyboard.dismiss();
  router.replace(remoteChatHref(target));
}

function ModalHeader({ selection }: { selection?: { selectedCount: number; onExit(): void } }) {
  const { t } = useTranslation();
  const { title, connectionName, status, dotClassName, expandTarget } = use(ModalHeaderContext);
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="border-b border-border-subtle bg-card"
    >
      <View className="min-h-14 flex-row items-center gap-2 px-2 py-1">
        <Pressable
          accessibilityLabel={t(selection ? 'common.cancel' : 'common.close')}
          accessibilityRole="button"
          className="size-12 items-center justify-center rounded-full active:bg-secondary"
          onPress={selection?.onExit ?? closeModal}
          testID="remote-session-modal-close"
        >
          <XIcon className="size-5 text-foreground" />
        </Pressable>
        <View className="min-w-0 flex-1 items-center">
          <Text
            accessibilityRole="header"
            className="font-semibold text-base text-foreground"
            numberOfLines={1}
          >
            {selection
              ? t('common.selection.count', { count: selection.selectedCount })
              : title || t('desktopDispatch.modal.title')}
          </Text>
          {!selection && status ? (
            <View className="flex-row items-center gap-1.5">
              <View className={`size-1.5 shrink-0 rounded-full ${dotClassName ?? ''}`} />
              <Text className="shrink text-xs text-muted-foreground" numberOfLines={1}>
                {connectionName ? `${connectionName} · ${status}` : status}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="size-12">
          {expandTarget && !selection ? (
            <Pressable
              accessibilityLabel={t('desktopDispatch.modal.expand')}
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-full active:bg-secondary"
              onPress={() => expandModal(expandTarget)}
              testID="remote-session-modal-expand"
            >
              <Maximize2Icon className="size-5 text-foreground" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
