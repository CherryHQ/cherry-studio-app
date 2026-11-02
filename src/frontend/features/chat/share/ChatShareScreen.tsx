import {
  BottomSheet,
  BottomSheetProvider,
  ContentState,
  SelectionIndicator,
} from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

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
import { useApiClient } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import {
  createAgentMessageListProjectionCache,
  resolveMessageModel,
} from '../runtime/agentMessageProjection';
import { projectLocalTranscriptMessage } from '../runtime/localConversationView';
import { useAgentMessageHistoryWindow } from '../runtime/useAgentMessageHistoryWindow';
import { getChatShareHandoff } from './chatShareHandoff';
import { chatShareMessagePreview } from './chatShareMessagePreview';
import {
  ChatShareSelectionProvider,
  useChatShareSelectionActions,
  useChatShareSelectionState,
  useIsChatMessageSelected,
} from './ChatShareSelectionProvider';
import { ChatShareSheet, closeChatShare } from './ChatShareSheet';
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
    translationHandoff?: string | string[];
  }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const scope = getSingleRouteParam(params.scope);
  const sessionId = getSingleRouteParam(params.sessionId);
  const messageId = getSingleRouteParam(params.messageId);
  const translationHandoff = getSingleRouteParam(params.translationHandoff);
  return (
    <View className="flex-1 bg-background">
      {!sessionId ? (
        <ShareLoadingState failed />
      ) : connectionId ? (
        <RemoteShareContent
          sessionId={sessionId}
          connectionId={connectionId}
          expectedScope={scope}
          messageId={messageId}
        />
      ) : (
        <LocalShareContent
          key={JSON.stringify([sessionId, translationHandoff])}
          sessionId={sessionId}
          messageId={messageId}
          translationHandoff={translationHandoff}
        />
      )}
    </View>
  );
}

/** Local selection reads the Session-keyed history window and one SQLite selection snapshot. */
function LocalShareContent({
  sessionId,
  messageId,
  translationHandoff,
}: {
  sessionId: string;
  messageId?: string;
  translationHandoff?: string;
}) {
  const api = useApiClient();
  const [translations] = useState(() => getChatShareHandoff(translationHandoff, sessionId));
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
      translations,
      prepareSelection: async (ids, signal) => {
        const snapshot = await api.get(`/agent-sessions/${sessionId}/messages/selection`, {
          query: { ids: [...ids] },
          signal,
        });
        return {
          title: snapshot.session.name,
          assistantName: snapshot.assistantName,
          messages: snapshot.messages.map((message) => ({
            ...message,
            modelName: resolveMessageModel(message)?.name,
          })),
        };
      },
    }),
    [api, sessionId, translations],
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
  const { session, error, isLoading } = useConversation(
    conversationRefFromRoute(sessionId, connectionId),
  );
  if (error || (session && expectedScope && session.scope !== expectedScope))
    return <ShareLoadingState failed />;
  if (isLoading || !session) return <ShareLoadingState />;
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
  return (
    <ChatShareSelectionProvider target={target} initialMessageId={messageId}>
      {/* The route-local portal must retain the selection context for its message rows. */}
      <BottomSheetProvider>
        <ChatShareSheet>
          <Text className="px-5 pb-3 text-muted-foreground text-sm">
            {t('chat.share.selectionHint')}
          </Text>
          <ChatShareMessages history={history} messageId={messageId} />
        </ChatShareSheet>
      </BottomSheetProvider>
    </ChatShareSelectionProvider>
  );
}

function ShareLoadingState({ failed = false }: { failed?: boolean }) {
  const { t } = useTranslation();
  return (
    <BottomSheetProvider>
      <BottomSheet
        open
        size="full"
        title={t('chat.share.title')}
        closeAction={{ accessibilityLabel: t('common.close') }}
        onClose={closeChatShare}
      >
        <View className="flex-1 justify-center p-5">
          {failed ? (
            <ContentState.Error title={t('chat.share.loadFailed')} />
          ) : (
            <ContentState.Loading />
          )}
        </View>
      </BottomSheet>
    </BottomSheetProvider>
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

function messageKey(message: ConversationMessage) {
  return message.key;
}
function renderMessage({ item }: LegendListRenderItemProps<ConversationMessage>) {
  return <ChatShareMessageRow message={item} />;
}
