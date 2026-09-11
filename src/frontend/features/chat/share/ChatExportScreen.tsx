import {
  Button,
  ContentState,
  Section,
  SelectionIndicator,
  useToast,
} from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDocumentExport } from '@/frontend/appShell/documentExport';
import { RouteHeader } from '@/frontend/appShell/header';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { AgentMessageView } from '@/shared/contracts/agent';

import { initialChatExportSelection, loadChatExportMessages } from './loadChatExportMessages';
import { isChatMessageExportable, toChatExportDocument } from './toChatExportDocument';
import { useChatExportMessages } from './useChatExportMessages';

export function ChatExportScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    sessionId?: string | string[];
    messageId?: string | string[];
  }>();
  const sessionId = getSingleRouteParam(params.sessionId);
  const messageId = getSingleRouteParam(params.messageId);
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerTransparent: false }} />
      <RouteHeader title={t('chat.share.title')} />
      {sessionId && messageId ? (
        <ChatExportRoute
          key={`${sessionId}:${messageId}`}
          sessionId={sessionId}
          messageId={messageId}
        />
      ) : (
        <ContentState.Error title={t('documentExport.unavailable')} />
      )}
    </View>
  );
}

function ChatExportRoute({ sessionId, messageId }: { sessionId: string; messageId: string }) {
  const { t } = useTranslation();
  const result = useChatExportMessages(sessionId, messageId);
  if (!result.query.data)
    return (
      <View className="flex-1 justify-center p-6">
        {result.query.isError ? (
          <ContentState.Error
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void result.query.refetch(),
            }}
            title={t('chat.share.loadFailed')}
          />
        ) : (
          <ContentState.Loading title={t('chat.share.loading')} />
        )}
      </View>
    );
  return <ChatExportSelection messageId={messageId} result={result} sessionId={sessionId} />;
}

type SelectionExtraData = {
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle(id: string): void;
  user: string;
  assistant: string;
  unsettled: string;
};

function ChatExportSelection({
  sessionId,
  messageId,
  result,
}: {
  sessionId: string;
  messageId: string;
  result: ReturnType<typeof useChatExportMessages>;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { bottom } = useSafeAreaInsets();
  const api = useApiClient();
  const sourceSession = useAgentSession(sessionId);
  const { agent: sourceAgent } = useAgentApiById(sourceSession.data?.agentId);
  const { open } = useDocumentExport();
  const { messages, query } = result;
  const [initialIndex] = useState(() =>
    Math.max(
      0,
      messages.findIndex((message) => message.id === messageId),
    ),
  );
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() =>
    initialChatExportSelection(messages, messageId),
  );
  const [includeProcess, setIncludeProcess] = useState(false);
  const [includeTimestamps, setIncludeTimestamps] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const operation = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') operation.current?.abort();
    });
    return () => {
      mounted.current = false;
      operation.current?.abort();
      subscription.remove();
    };
  }, []);
  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 128) next.add(id);
      return next;
    });
  }, []);
  const extraData = useMemo<SelectionExtraData>(
    () => ({
      selected: selectedIds,
      disabled: isSubmitting,
      onToggle: toggle,
      user: t('chat.share.user'),
      assistant: sourceAgent?.name || t('chat.share.assistant'),
      unsettled: t('chat.share.unsettled'),
    }),
    [isSubmitting, selectedIds, sourceAgent?.name, t, toggle],
  );
  const continueExport = async () => {
    if (isSubmitting || operation.current || !selectedIds.size) return;
    const controller = new AbortController();
    operation.current = controller;
    setIsSubmitting(true);
    try {
      const selected = await loadChatExportMessages(
        [...selectedIds],
        (query) => api.get(`/agent-sessions/${sessionId}/messages`, { query }),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const document = toChatExportDocument(selected, {
        title: sourceSession.data?.title.trim() || t('chat.share.documentTitle'),
        includeProcess,
        includeTimestamps,
        labels: {
          user: t('chat.share.user'),
          assistant: sourceAgent?.name || t('chat.share.assistant'),
          process: t('chat.share.process'),
          reasoning: t('chat.share.reasoning'),
          timestamp: t('chat.share.timestamp'),
          file: t('chat.share.file'),
          status: t('chat.share.status'),
          messageStatuses: {
            pending: t('chat.share.unsettled'),
            streaming: t('chat.share.unsettled'),
            success: t('chat.share.completed'),
            error: t('chat.share.error'),
            cancelled: t('chat.share.cancelled'),
            interrupted: t('chat.share.interrupted'),
          },
        },
      });
      // The exporter now owns an immutable document/session; chat's cancellation no longer owns it.
      operation.current = undefined;
      const outcome = await open({ input: { kind: 'document', document } });
      if (outcome === 'busy' && mounted.current)
        toast.show({ label: t('documentExport.errors.busy'), variant: 'danger' });
    } catch {
      if (mounted.current && !controller.signal.aborted)
        toast.show({ label: t('chat.share.loadFailed'), variant: 'danger' });
    } finally {
      if (operation.current === controller) operation.current = undefined;
      if (mounted.current) setIsSubmitting(false);
    }
  };
  const options = (
    <View className="gap-3 px-4 pb-4">
      <Text className="text-muted-foreground text-sm">{t('chat.share.selectionHint')}</Text>
      <Section>
        <Section.SwitchItem
          disabled={isSubmitting}
          label={t('chat.share.includeProcess')}
          onValueChange={setIncludeProcess}
          value={includeProcess}
        />
        <Section.SwitchItem
          disabled={isSubmitting}
          label={t('chat.share.includeTimestamps')}
          onValueChange={setIncludeTimestamps}
          value={includeTimestamps}
        />
      </Section>
    </View>
  );
  const footer = (
    <View className="px-4 py-4">
      {query.isError ? (
        <ContentState.Error
          primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
          title={t('chat.share.loadFailed')}
        />
      ) : query.hasNextPage ? (
        <Button
          disabled={query.isFetching || isSubmitting}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          variant="ghost"
        >
          {t('chat.share.older')}
        </Button>
      ) : null}
    </View>
  );
  return (
    <View className="flex-1">
      {options}
      <LegendList
        contentContainerStyle={styles.listContent}
        data={messages}
        dataKey={sessionId}
        estimatedItemSize={96}
        extraData={extraData}
        initialScrollIndex={initialIndex}
        keyExtractor={messageKey}
        ListFooterComponent={footer}
        ListHeaderComponent={
          <View className="px-4">
            {query.hasPreviousPage ? (
              <Button
                disabled={query.isFetching || isSubmitting}
                onPress={() => void query.fetchPreviousPage()}
                variant="ghost"
              >
                {t('chat.share.newer')}
              </Button>
            ) : null}
          </View>
        }
        recycleItems
        renderItem={renderMessage}
      />
      <View className="gap-3 px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
        <Text className="text-muted-foreground text-sm">
          {t('chat.share.selected', { count: selectedIds.size })}
        </Text>
        <Button
          disabled={!selectedIds.size || isSubmitting}
          loading={isSubmitting}
          onPress={() => void continueExport()}
        >
          {t('chat.share.continue')}
        </Button>
      </View>
    </View>
  );
}

function renderMessage({ item, extraData }: LegendListRenderItemProps<AgentMessageView>) {
  return <ChatExportMessage message={item} selection={extraData as SelectionExtraData} />;
}

function ChatExportMessage({
  message,
  selection,
}: {
  message: AgentMessageView;
  selection: SelectionExtraData;
}) {
  const selected = selection.selected.has(message.id);
  const eligible = isChatMessageExportable(message);
  const disabled = selection.disabled || !eligible || (!selected && selection.selected.size >= 128);
  const label = message.role === 'user' ? selection.user : selection.assistant;
  const text = message.parts.findLast((part) => part.type === 'text' && part.text.trim());
  const preview =
    text?.type === 'text'
      ? text.text.slice(0, 240)
      : message.parts
          .filter((part) => part.type === 'file')
          .map((part) => part.name)
          .filter(Boolean)
          .join(', ');
  return (
    <Pressable
      accessibilityLabel={`${label}: ${preview}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      className="min-h-24 flex-row items-center gap-3 px-4 py-3 active:opacity-60 disabled:opacity-40"
      disabled={disabled}
      onPress={() => selection.onToggle(message.id)}
    >
      <SelectionIndicator selected={selected} />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-medium text-foreground text-sm">{label}</Text>
        <Text className="text-foreground text-sm" numberOfLines={2}>
          {preview}
        </Text>
        {!eligible ? (
          <Text className="text-muted-foreground text-xs">{selection.unsettled}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function messageKey(message: AgentMessageView) {
  return message.id;
}
const styles = StyleSheet.create({ listContent: { paddingTop: 12 } });
