import MessageCircleIcon from '@cherrystudio/app-icons/icons/message-circle';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { chatHref } from '@/frontend/appShell/navigation/chat';
import { useAppSearch } from '@/frontend/appShell/search';
import { useApiClient } from '@/frontend/data/DataApiProvider';

import { searchSessions, type SessionSearchResult } from './sessionSearch';

export function useSessionSearch() {
  const { t } = useTranslation();
  const router = useRouter();
  const apiClient = useApiClient();
  const { open } = useAppSearch();

  return useCallback(() => {
    void open<SessionSearchResult>({
      emptyText: t('session.search.noResults'),
      getAccessibilityLabel: ({ item, kind }) =>
        kind === 'session'
          ? item.title || t('session.list.untitled')
          : `${item.sessionTitle || t('session.list.untitled')}: ${item.snippet}`,
      keyExtractor: ({ item, kind }) =>
        kind === 'session' ? `session:${item.id}` : `message:${item.messageId}`,
      loadRecent: async ({ signal }) => {
        if (signal.aborted) return { groups: [] };
        const page = await apiClient.get('/agent-sessions', { query: { limit: 10 } });
        return {
          groups: page.items.length
            ? [
                {
                  key: 'recent',
                  title: t('session.search.recent'),
                  items: page.items.map((item) => ({ kind: 'session' as const, item })),
                },
              ]
            : [],
        };
      },
      placeholder: t('session.search.placeholder'),
      renderItem: (result) => <SessionSearchResultRow result={result} />,
      search: (input) =>
        searchSessions(apiClient, input, {
          sessions: t('session.search.sessions'),
          messages: t('session.search.messages'),
        }),
    }).then((outcome) => {
      if (outcome.type !== 'selected') return;
      const result = outcome.item;
      router.navigate(
        chatHref(
          result.kind === 'session'
            ? { kind: 'session', sessionId: result.item.id }
            : {
                kind: 'session',
                sessionId: result.item.sessionId,
                messageId: result.item.messageId,
                messageRequestId: Crypto.randomUUID(),
              },
        ),
      );
    });
  }, [apiClient, open, router, t]);
}

function SessionSearchResultRow({ result }: { result: SessionSearchResult }) {
  const { t, i18n } = useTranslation();
  const title =
    (result.kind === 'session' ? result.item.title : result.item.sessionTitle) ||
    t('session.list.untitled');
  const subtitle =
    result.kind === 'message'
      ? result.item.snippet
      : new Date(result.item.lastActivityAt).toLocaleString(i18n.language);

  return (
    <View className="flex-row items-center gap-4 py-3">
      <View className="size-11 items-center justify-center rounded-xl border border-border">
        <MessageCircleIcon className="size-6 text-foreground" />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-base text-foreground" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-muted-foreground text-sm" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
