import ListFilterIcon from '@cherrystudio/app-icons/icons/list-filter';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import type { MenuItem } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { chatHref, type ChatTarget } from '@/frontend/appShell/navigation/chat';
import { type AppSearchGroup, useAppSearch } from '@/frontend/appShell/search';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { SessionList, sessionSelectionScope } from '@/frontend/components/SessionList';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { useAgentApiById, useAgentsApi } from '@/frontend/hooks/agent';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type {
  EntitySearchItem,
  SessionMessageContentSearchItem,
} from '@/shared/data/api/schemas/search';

/**
 * Full Agent Session management page (`/sessions`), backed by session-title and
 * session-message search.
 */
function SessionListScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { agentId: rawAgentId } = useLocalSearchParams<{
    agentId?: string | string[];
  }>();
  const agentId = getSingleRouteParam(rawAgentId);
  const { agent } = useAgentApiById(agentId);
  const { agents } = useAgentsApi();
  const apiClient = useApiClient();
  const { open: openAppSearch } = useAppSearch();
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const selectedAgentLabel = agentId
    ? (agent?.name ??
      agents.find((availableAgent) => availableAgent.id === agentId)?.name ??
      t('session.list.deletedAgent'))
    : t('session.list.title');
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
                query: { agentId, limitPerType: 50, q: query, types: ['session'] },
              }),
          apiClient.get('/search/contents', {
            query: { agentId, cursor, limit: 50, q: query },
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

      router.push(chatHref(getSearchResultTarget(outcome.item)));
    });
  }, [agentId, apiClient, openAppSearch, router, t]);
  const setAgentFilter = useCallback(
    (nextAgentId: string | undefined) => {
      router.setParams({ agentId: nextAgentId, view: undefined });
    },
    [router],
  );
  const menuItems = useMemo<readonly MenuItem[]>(() => {
    const filterItems: MenuItem[] = [
      {
        checked: !agentId,
        disabled: isDeletionPending,
        id: 'filter-all-sessions',
        label: t('session.list.title'),
        onPress: () => setAgentFilter(undefined),
      },
      ...agents.map((availableAgent) => ({
        checked: availableAgent.id === agentId,
        disabled: isDeletionPending,
        id: `filter-agent-${availableAgent.id}`,
        label: availableAgent.name,
        onPress: () => setAgentFilter(availableAgent.id),
      })),
    ];

    if (agentId && !agents.some((availableAgent) => availableAgent.id === agentId)) {
      filterItems.push({
        checked: true,
        disabled: isDeletionPending,
        id: `filter-agent-${agentId}`,
        label: selectedAgentLabel,
        onPress: () => setAgentFilter(agentId),
      });
    }

    return [
      ...filterItems,
      {
        disabled: isDeletionPending,
        id: 'select-sessions',
        label: t('session.selection.start'),
        onPress: handleEnterEditing,
      },
    ];
  }, [
    agentId,
    agents,
    handleEnterEditing,
    isDeletionPending,
    selectedAgentLabel,
    setAgentFilter,
    t,
  ]);
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
        accessibilityLabel: t('session.filter.label'),
        icon: ListFilterIcon,
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
        title={selectedAgentLabel}
      />
      <View className="flex-1">
        <SessionList agentId={agentId} />
        <SelectionControls scope={sessionSelectionScope} />
      </View>
    </>
  );
}

type SessionSearchResult =
  | { item: Extract<EntitySearchItem, { type: 'session' }>; kind: 'session' }
  | { item: SessionMessageContentSearchItem; kind: 'message' };

function getSearchResultTarget(result: SessionSearchResult): ChatTarget {
  return {
    kind: 'session',
    sessionId: result.kind === 'session' ? result.item.target.sessionId : result.item.sessionId,
  };
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
