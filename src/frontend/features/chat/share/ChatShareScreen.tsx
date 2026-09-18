import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, ContentState, SelectionIndicator } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RemoteAgentProvider,
  useRemoteAgent,
  useRemoteAgents,
  useRemoteConnection,
} from '@/frontend/appShell/remoteAgent';
import { useAgentMessageHistoryWindow } from '@/frontend/hooks/agent';
import type { AgentMessageHistoryWindow } from '@/frontend/hooks/agent';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { chatShareMessagePreview } from './chatShareMessagePreview';
import {
  ChatShareSelectionProvider,
  useChatShareSelectionActions,
  useChatShareSelectionCount,
  useChatShareSelectionState,
  useIsChatMessageSelected,
} from './ChatShareSelectionProvider';
import { createRemoteChatShareSource, toRemoteChatExportMessage } from './remoteChatShare';
import { type ChatExportMessage, isChatMessageExportable } from './toChatExportDocument';

const LIST_STYLE = { flex: 1 };
const LIST_CONTENT_STYLE = { paddingHorizontal: 20, paddingBottom: 12, gap: 8 };
const KEEP_VISIBLE_POSITION = { data: true, size: true };

export function ChatShareScreen() {
  const params = useLocalSearchParams<{
    connectionId?: string | string[];
    sourceKey?: string | string[];
    agentId?: string | string[];
    sessionId?: string | string[];
    messageId?: string | string[];
  }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const sourceKey = getSingleRouteParam(params.sourceKey);
  const agentId = getSingleRouteParam(params.agentId);
  const sessionId = getSingleRouteParam(params.sessionId);
  const messageId = getSingleRouteParam(params.messageId);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Button
          accessibilityLabel={t('common.cancel')}
          icon={<XIcon />}
          onPress={closeSelection}
          variant="ghost"
        />
        <Text
          accessibilityRole="header"
          className="flex-1 text-center font-semibold text-foreground"
        >
          {t('chat.share.selectMessages')}
        </Text>
        <View className="size-11" />
      </View>
      {sessionId && connectionId ? (
        <RemoteAgentProvider connectionId={connectionId}>
          <RemoteShareContent
            sessionId={sessionId}
            sourceKey={sourceKey}
            agentId={agentId}
            messageId={messageId}
          />
        </RemoteAgentProvider>
      ) : sessionId ? (
        <ChatShareSelectionProvider
          key={JSON.stringify([sessionId, messageId])}
          sessionId={sessionId}
          initialMessageId={messageId}
        >
          <Text className="px-5 pb-3 text-muted-foreground text-sm">
            {t('chat.share.selectionHint')}
          </Text>
          <LocalChatShareMessages sessionId={sessionId} messageId={messageId} />
          <ChatShareControls />
        </ChatShareSelectionProvider>
      ) : (
        <ContentState.Error title={t('chat.share.loadFailed')} />
      )}
    </View>
  );
}

function LocalChatShareMessages({
  sessionId,
  messageId,
}: {
  sessionId: string;
  messageId?: string;
}) {
  const history = useAgentMessageHistoryWindow(sessionId, { messageId });
  return <ChatShareMessages history={history} messageId={messageId} />;
}

type ShareHistory = Pick<
  AgentMessageHistoryWindow,
  | 'dataKey'
  | 'isLoadingInitial'
  | 'isLoadingOlder'
  | 'isLoadingNewer'
  | 'error'
  | 'retry'
  | 'hasNewerMessages'
> & {
  messages: readonly ChatExportMessage[];
  loadOlder?: () => Promise<void>;
  loadNewer?: () => Promise<void>;
};

function RemoteShareContent({
  sessionId,
  sourceKey,
  agentId,
  messageId,
}: {
  sessionId: string;
  sourceKey?: string;
  agentId?: string;
  messageId?: string;
}) {
  const { t } = useTranslation();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const agents = useRemoteAgents();
  const sameSource = Boolean(sourceKey) && sourceKey === connection.sourceKey;
  const history = useInfiniteQuery({
    queryKey: ['agentController', connectionId, sourceKey, sessionId, 'history'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => controller.history(sessionId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: sameSource && connection.status === 'ready',
    retry: false,
  });
  const messages = [
    ...new Map(
      history.data?.pages
        .flatMap((page) => page.items)
        .map((message) => [message.id, toRemoteChatExportMessage(message)]),
    ).values(),
  ].toReversed();
  const needsMessage = Boolean(messageId && !messages.some((message) => message.id === messageId));
  useEffect(() => {
    if (
      sameSource &&
      needsMessage &&
      history.hasNextPage &&
      !history.isFetchingNextPage &&
      !history.isError
    )
      void history.fetchNextPage();
  }, [sameSource, needsMessage, history]);
  if (!sameSource || connection.status !== 'ready')
    return (
      <ContentState.Error
        title={t('remoteAgent.disconnected')}
        primaryAction={{ children: t('common.retry'), onPress: () => controller.reconnect() }}
      />
    );
  if (history.isLoading || (needsMessage && history.hasNextPage && !history.isError))
    return (
      <View className="flex-1 justify-center p-5">
        <ContentState.Loading />
      </View>
    );
  const source = createRemoteChatShareSource(
    controller,
    { connectionId, sourceKey, sessionId, agentId },
    agents.agents.find((agent) => agent.id === agentId)?.name,
  );
  return (
    <ChatShareSelectionProvider
      key={`${connectionId}:${sourceKey}:${sessionId}:${messageId}`}
      sessionId={sessionId}
      initialMessageId={
        messages.some((message) => message.id === messageId && isChatMessageExportable(message))
          ? messageId
          : undefined
      }
      source={source}
    >
      <Text className="px-5 pb-3 text-muted-foreground text-sm">
        {t('chat.share.selectionHint')}
      </Text>
      <ChatShareMessages
        messageId={messageId}
        history={{
          messages,
          dataKey: `pc:${connectionId}:${sourceKey}:${sessionId}`,
          isLoadingInitial:
            history.isLoading || (needsMessage && Boolean(history.hasNextPage) && !history.isError),
          error: history.error ?? undefined,
          retry: async () => {
            await history.refetch();
          },
          isLoadingOlder: history.isFetchingNextPage,
          isLoadingNewer: false,
          hasNewerMessages: false,
          loadNewer: undefined,
          loadOlder:
            history.hasNextPage && !history.isFetchingNextPage
              ? async () => {
                  await history.fetchNextPage();
                }
              : undefined,
        }}
      />
      <ChatShareControls />
    </ChatShareSelectionProvider>
  );
}

function ChatShareMessages({ history, messageId }: { history: ShareHistory; messageId?: string }) {
  const { t } = useTranslation();
  const messages = history.messages.filter((message) => message.role !== 'system');

  if (history.isLoadingInitial)
    return (
      <View className="flex-1 justify-center p-5">
        <ContentState.Loading />
      </View>
    );
  if (history.error && !messages.length) {
    return (
      <View className="flex-1 justify-center p-5">
        <ContentState.Error
          title={t('chat.share.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void history.retry() }}
        />
      </View>
    );
  }

  return (
    <>
      <LegendList
        style={LIST_STYLE}
        contentContainerStyle={LIST_CONTENT_STYLE}
        data={messages}
        dataKey={history.dataKey}
        estimatedItemSize={144}
        initialScrollIndex={Math.max(
          0,
          messages.findIndex((message) => message.id === messageId),
        )}
        keyExtractor={messageKey}
        maintainVisibleContentPosition={KEEP_VISIBLE_POSITION}
        onStartReached={history.loadOlder}
        onEndReached={history.hasNewerMessages ? history.loadNewer : undefined}
        onStartReachedThreshold={0.3}
        onEndReachedThreshold={0.3}
        recycleItems
        renderItem={renderMessage}
        ListEmptyComponent={<ContentState.Empty title={t('chat.share.errors.empty')} />}
      />
      {history.error ? (
        <View className="px-5 py-2">
          <ContentState.Error
            layout="row"
            title={t('chat.share.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void history.retry() }}
          />
        </View>
      ) : null}
      {history.isLoadingOlder || history.isLoadingNewer ? (
        <View className="p-2">
          <ContentState.Loading layout="row" />
        </View>
      ) : null}
    </>
  );
}

const ChatShareMessageRow = memo(function ChatShareMessageRow({
  message,
}: {
  message: ChatExportMessage;
}) {
  const { t, i18n } = useTranslation();
  const { isSharing } = useChatShareSelectionState();
  const { toggleMessage } = useChatShareSelectionActions();
  const selected = useIsChatMessageSelected(message.id);
  const disabled = isSharing || !isChatMessageExportable(message);
  const preview = useMemo(() => chatShareMessagePreview(message), [message]);
  const role = t(message.role === 'user' ? 'chat.share.user' : 'chat.share.assistant');

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${role}: ${preview || t('chat.share.previewWithoutText')}`}
      accessibilityState={{ checked: selected, disabled }}
      className={
        selected
          ? 'flex-row items-start gap-3 rounded-2xl bg-secondary p-4'
          : 'flex-row items-start gap-3 rounded-2xl p-4 active:bg-secondary'
      }
      disabled={disabled}
      onPress={() => toggleMessage(message.id)}
      testID={`chat-share-select-${message.id}`}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <SelectionIndicator disabled={disabled} selected={selected} />
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-foreground text-sm" numberOfLines={1}>
            {role}
          </Text>
          <Text className="shrink text-muted-foreground text-xs" numberOfLines={1}>
            {message.truncated
              ? t('remoteAgent.truncated')
              : !isChatMessageExportable(message)
                ? t('chat.share.unsettled')
                : message.createdAt
                  ? new Date(message.createdAt).toLocaleString(
                      i18n.resolvedLanguage ?? i18n.language,
                    )
                  : ''}
          </Text>
        </View>
        <Text className="text-muted-foreground text-sm" numberOfLines={4}>
          {preview || t('chat.share.previewWithoutText')}
        </Text>
      </View>
    </Pressable>
  );
});

function ChatShareControls() {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { isSharing } = useChatShareSelectionState();
  const { confirmSelection } = useChatShareSelectionActions();
  const count = useChatShareSelectionCount();
  return (
    <View className="gap-3 px-5 pt-3" style={{ paddingBottom: Math.max(bottom, 12) }}>
      <Text accessibilityLiveRegion="polite" className="text-center text-muted-foreground text-sm">
        {t('common.selection.count', { count })}
      </Text>
      <Button
        disabled={!count || isSharing}
        loading={isSharing}
        onPress={confirmSelection}
        testID="chat-share-confirm"
      >
        {t('chat.share.confirmSelection')}
      </Button>
    </View>
  );
}

function messageKey(message: ChatExportMessage) {
  return message.id;
}
function renderMessage({ item }: LegendListRenderItemProps<ChatExportMessage>) {
  return <ChatShareMessageRow message={item} />;
}
function closeSelection() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
