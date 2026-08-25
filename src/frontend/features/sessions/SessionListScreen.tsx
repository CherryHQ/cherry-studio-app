import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import type { MenuItem } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { type AppSearchGroup, useAppSearch } from '@/frontend/components/appSearch';
import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import type {
  EntitySearchItem,
  SessionMessageContentSearchItem,
} from '@/shared/data/api/schemas/search';

import { sessionSelectionScope } from './hooks/useSessionSelectionSource';
import { SessionList } from './SessionList';

/**
 * Full session management page (`/sessions`): the Agent Session counterpart of
 * the topic management page, backed by Session-title and Session-message search.
 */
function SessionListScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const apiClient = useApiClient();
  const { open: openAppSearch } = useAppSearch();
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const handleEnterEditing = useCallback(() => {
    if (isDeletionPending) {
      return;
    }

    enterEditing();
  }, [enterEditing, isDeletionPending]);
  const openSessionSearch = useCallback(() => {
    void openAppSearch<SessionSearchResult>({
      emptyText: t('session.search.noResults'),
      getAccessibilityLabel: ({ item, kind }) =>
        kind === 'session' ? item.title : `${item.sessionTitle}: ${item.snippet}`,
      keyExtractor: ({ item, kind }) =>
        kind === 'session' ? `session:${item.id}` : `message:${item.messageId}`,
      placeholder: t('navigation.search'),
      renderItem: (result) => <SessionSearchResultRow result={result} />,
      search: async ({ cursor, query }) => {
        const [entityResult, contentResult] = await Promise.all([
          cursor
            ? undefined
            : apiClient.get('/search/entities', {
                query: { limitPerType: 50, q: query, types: ['session'] },
              }),
          apiClient.get('/search/contents', {
            query: { cursor, limit: 50, q: query },
          }),
        ]);
        const groups: AppSearchGroup<SessionSearchResult>[] = [];
        const sessionGroup = entityResult?.groups.find((group) => group.type === 'session');
        if (sessionGroup && sessionGroup.items.length > 0) {
          groups.push({
            items: sessionGroup.items.map((item) => ({ item, kind: 'session' })),
            key: 'sessions',
            title: t('session.search.sessions'),
          });
        }
        if (contentResult.items.length > 0) {
          groups.push({
            items: contentResult.items.map((item) => ({ item, kind: 'message' })),
            key: 'messages',
            title: t('session.search.messages'),
          });
        }
        return { groups, nextCursor: contentResult.nextCursor };
      },
    }).then((outcome) => {
      if (outcome.type !== 'selected') {
        return;
      }

      const { item } = outcome.item;
      router.push({
        params: { agentId: item.agentId, sessionId: getSearchResultSessionId(outcome.item) },
        pathname: '/',
      });
    });
  }, [apiClient, openAppSearch, router, t]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        disabled: isDeletionPending,
        id: 'select-sessions',
        label: t('session.selection.start'),
        onPress: handleEnterEditing,
      },
    ],
    [handleEnterEditing, isDeletionPending, t],
  );
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('navigation.search'),
        disabled: isDeletionPending,
        icon: SearchIcon,
        key: 'search-sessions',
        onPress: openSessionSearch,
        type: 'icon',
      },
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'session-actions',
        type: 'menu',
      },
    ],
    [isDeletionPending, menuItems, openSessionSearch, t],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        disabled: isDeletionPending,
        key: 'finish-selecting-sessions',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, isDeletionPending, t],
  );

  return (
    <>
      <RouteHeader
        rightActions={isEditing ? doneActions : rightActions}
        title={t('session.list.title')}
      />
      <View className="flex-1 bg-background">
        <SessionList />
        <SelectionControls scope={sessionSelectionScope} />
      </View>
    </>
  );
}

type SessionSearchResult =
  | { item: Extract<EntitySearchItem, { type: 'session' }>; kind: 'session' }
  | { item: SessionMessageContentSearchItem; kind: 'message' };

function getSearchResultSessionId(result: SessionSearchResult): string {
  return result.kind === 'session' ? result.item.id : result.item.sessionId;
}

function SessionSearchResultRow({ result }: { result: SessionSearchResult }) {
  const { t } = useTranslation();
  const title =
    (result.kind === 'session' ? result.item.title : result.item.sessionTitle) ||
    t('session.list.untitled');
  const subtitle =
    result.kind === 'session'
      ? (result.item.subtitle ?? t('session.list.deletedAgent'))
      : result.item.snippet;

  return (
    <View className="min-h-12 justify-center gap-0.5">
      <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
        {title}
      </Text>
      <Text className="text-foreground-tertiary text-xs" numberOfLines={2}>
        {subtitle}
      </Text>
    </View>
  );
}

export function SessionListScreen() {
  return (
    <SelectionProvider>
      <SessionListScreenBody />
    </SelectionProvider>
  );
}
