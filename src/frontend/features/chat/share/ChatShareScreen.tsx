import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, ContentState, SelectionIndicator } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  ConversationMessage,
  ConversationHistoryView,
} from '@/frontend/appShell/conversation';
import {
  useConversation,
  useConversationSnapshot,
  useConversationHistory,
  type RemoteConversationSession,
} from '@/frontend/appShell/conversation/remote';
import { conversationRefFromRoute } from '@/frontend/appShell/navigation/chat';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { createAgentMessageListProjectionCache } from '../runtime/agentMessageProjection';
import { projectLocalTranscriptMessage } from '../runtime/localConversationView';
import { useAgentMessageHistoryWindow } from '../runtime/useAgentMessageHistoryWindow';
import { chatShareMessagePreview } from './chatShareMessagePreview';
import {
  ChatShareSelectionProvider,
  useChatShareSelectionActions,
  useChatShareSelectionCount,
  useChatShareSelectionState,
  useIsChatMessageSelected,
} from './ChatShareSelectionProvider';
import type { ChatShareTarget } from './chatShareTarget';

const LIST_STYLE = { flex: 1 };
const LIST_CONTENT_STYLE = { paddingHorizontal: 20, paddingBottom: 12, gap: 8 };
const KEEP_VISIBLE_POSITION = { data: true, size: true };

export function ChatShareScreen() {
  const params = useLocalSearchParams<{
    connectionId?: string | string[];
    scope?: string | string[];
    sessionId?: string | string[];
    messageId?: string | string[];
  }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const scope = getSingleRouteParam(params.scope);
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
      {!sessionId ? (
        <ContentState.Error title={t('chat.share.loadFailed')} />
      ) : connectionId ? (
        <RemoteShareContent
          sessionId={sessionId}
          connectionId={connectionId}
          expectedScope={scope}
          messageId={messageId}
        />
      ) : (
        <LocalShareContent key={sessionId} sessionId={sessionId} messageId={messageId} />
      )}
    </View>
  );
}

/** Local selection reads the Session-keyed history window and one SQLite selection snapshot. */
function LocalShareContent({ sessionId, messageId }: { sessionId: string; messageId?: string }) {
  const api = useApiClient();
  const window = useAgentMessageHistoryWindow(sessionId, { messageId });
  const cache = useMemo(() => createAgentMessageListProjectionCache(), []);
  const messages = useMemo(
    () => window.messages.map((message) => projectLocalTranscriptMessage(message, cache)),
    [window.messages, cache],
  );
  const history = useMemo<ConversationHistoryView>(
    () => ({ ...window, messages }),
    [window, messages],
  );
  const target = useMemo<ChatShareTarget>(
    () => ({
      ref: { source: { kind: 'local' }, sessionId },
      prepareSelection: async (ids, signal) => {
        const snapshot = await api.get(`/agent-sessions/${sessionId}/messages/selection`, {
          query: { ids: [...ids] },
          signal,
        });
        return {
          title: snapshot.session.title,
          assistantName: snapshot.assistantName,
          messages: snapshot.messages,
        };
      },
    }),
    [api, sessionId],
  );
  return <ConversationShareSelection target={target} history={history} messageId={messageId} />;
}

function RemoteShareContent({
  sessionId,
  connectionId,
  expectedScope,
  messageId,
}: {
  sessionId: string;
  connectionId: string;
  expectedScope?: string;
  messageId?: string;
}) {
  const { t } = useTranslation();
  const { session, error, isLoading } = useConversation(
    conversationRefFromRoute(sessionId, connectionId),
  );
  if (error || (session && expectedScope && session.scope !== expectedScope))
    return <ContentState.Error title={t('chat.share.loadFailed')} />;
  if (isLoading || !session) return <ContentState.Loading />;
  return (
    <RemoteShareSelection
      key={JSON.stringify([session.scope, sessionId, messageId])}
      session={session}
      messageId={messageId}
    />
  );
}
function RemoteShareSelection({
  session,
  messageId,
}: {
  session: RemoteConversationSession;
  messageId?: string;
}) {
  const snapshot = useConversationSnapshot(session);
  const history = useConversationHistory(
    session,
    snapshot.historyVersion,
    messageId ? { messageId, key: messageId } : undefined,
  );
  const target = useMemo<ChatShareTarget>(
    () => ({
      ref: session.ref,
      prepareSelection: (ids, signal) => session.history.prepareSelection(ids, signal),
    }),
    [session],
  );
  return <ConversationShareSelection target={target} history={history} messageId={messageId} />;
}
function ConversationShareSelection({
  target,
  history,
  messageId,
}: {
  target: ChatShareTarget;
  history: ConversationHistoryView;
  messageId?: string;
}) {
  const { t } = useTranslation();
  const located = history.messages.find((message) => message.key === messageId);
  const locating = Boolean(messageId && !located && history.hasOlderMessages && !history.error);
  const { isLoadingInitial, isLoadingOlder, loadOlder } = history;
  useEffect(() => {
    if (locating && !isLoadingInitial && !isLoadingOlder) void loadOlder();
  }, [locating, isLoadingInitial, isLoadingOlder, loadOlder]);
  if (history.isLoadingInitial || locating) return <ContentState.Loading />;
  return (
    <ChatShareSelectionProvider
      target={target}
      initialMessageId={located && isExportable(located) ? messageId : undefined}
    >
      <Text className="px-5 pb-3 text-muted-foreground text-sm">
        {t('chat.share.selectionHint')}
      </Text>
      <ChatShareMessages history={history} messageId={messageId} />
      <ChatShareControls />
    </ChatShareSelectionProvider>
  );
}
type ShareHistory = ConversationHistoryView;
function isExportable(message: ConversationMessage) {
  return (
    message.display.role !== 'system' &&
    message.state !== 'pending' &&
    message.state !== 'streaming' &&
    message.completeness === 'complete'
  );
}

function ChatShareMessages({ history, messageId }: { history: ShareHistory; messageId?: string }) {
  const { t } = useTranslation();
  const messages = history.messages.filter((message) => message.display.role !== 'system');

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
          messages.findIndex((message) => message.key === messageId),
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
  message: ConversationMessage;
}) {
  const { t, i18n } = useTranslation();
  const { isSharing } = useChatShareSelectionState();
  const { toggleMessage } = useChatShareSelectionActions();
  const selected = useIsChatMessageSelected(message.key);
  const disabled = isSharing || !isExportable(message);
  const preview = useMemo(() => chatShareMessagePreview(message), [message]);
  const role = t(message.display.role === 'user' ? 'chat.share.user' : 'chat.share.assistant');

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
      onPress={() => toggleMessage(message.key)}
      testID={`chat-share-select-${message.key}`}
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
            {message.completeness === 'partial'
              ? t('remoteAgent.truncated')
              : !isExportable(message)
                ? t('chat.share.unsettled')
                : message.display.createdAt
                  ? new Date(message.display.createdAt).toLocaleString(
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

function messageKey(message: ConversationMessage) {
  return message.key;
}
function renderMessage({ item }: LegendListRenderItemProps<ConversationMessage>) {
  return <ChatShareMessageRow message={item} />;
}
function closeSelection() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
