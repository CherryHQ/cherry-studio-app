import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import {
  LockedGroupSlice,
  type MenuItem,
  ScrollInteractionBoundary,
  Section,
  Sortable,
  Spinner,
  useSortableScrollController,
  useToast,
} from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { cn } from '@cherrystudio/ui/utils';
import type { LegendListRef } from '@legendapp/list/react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityProps, StyleSheet, View, type ViewProps } from 'react-native';
import { LinearTransition, ReduceMotion, useReducedMotion } from 'react-native-reanimated';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { InlineSearch } from '@/frontend/components/InlineSearch';
import { withPolicy, withResourcePolicy } from '@/frontend/components/Policy';
import { useInfiniteQuery, useMutation, useQuery, useReorder } from '@/frontend/data';
import { dataApiCollectionFilters } from '@/frontend/data/utils/optimisticQueryUpdate';
import { reorderLocally } from '@/frontend/data/utils/reorder';
import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';
import { capabilityPolicy } from '@/shared/data/managedPolicy';
import type { Provider } from '@/shared/data/types/provider';

import { SettingsGroupedSeparator } from '../components/SettingsServiceRow';
import { ProviderListRow } from './components/ProviderListRow';
import { useProviderSetup } from './hooks/useProviderSetup';
import { PROVIDER_LIST_PAGE_SIZE, PROVIDER_LIST_STALE_TIME } from './providerListQuery';

const PROVIDER_ROW_ESTIMATED_HEIGHT = 56;
const providerListTransition = LinearTransition.duration(duration.base)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);

type ProviderListItem =
  | { id: string; kind: 'header'; isFirst: boolean; title: string }
  | {
      id: string;
      kind: 'provider';
      provider: Provider;
      groupId: 'pinned' | 'enabled' | 'disabled';
      groupIndex: number;
      groupSize: number;
      isEnabled: boolean;
      isFirst: boolean;
      isLast: boolean;
      isPending: boolean;
      isPinned: boolean;
      /** The list's final row, which closes an organization's locked group. */
      endsList?: boolean;
    };

type ProviderListExtraData = {
  canEditProviders: boolean;
  canReorderProviders: boolean;
  onMoveToTop: (groupId: string, fromIndex: number) => void;
};

// Adding or importing providers is not offered when the organization supplies them.
const ProviderListHeader = withPolicy(RouteHeader, (policy) =>
  policy.canEdit('provider') ? {} : { rightActions: undefined },
);
/**
 * One item's share of its card, so the list can stay virtualized. An organization's providers share
 * one locked group instead of a card per section.
 */
function ProviderListSliceView({
  children,
  item,
  managed = false,
}: {
  children: ReactNode;
  item: ProviderListItem;
  managed?: boolean;
}) {
  if (managed) {
    const slice = (
      <LockedGroupSlice
        isFirst={item.kind === 'header' && item.isFirst}
        isLast={item.kind === 'provider' && item.endsList === true}
      >
        {item.kind === 'header' ? <View className="px-4">{children}</View> : children}
      </LockedGroupSlice>
    );
    return item.kind === 'header' ? <View className="mx-4">{slice}</View> : slice;
  }
  return item.kind === 'header' ? (
    // Mirrors a titled `Section`: the title sits 12pt inside the card edge, 4pt above it.
    <View className={cn('px-7 pb-1', item.isFirst ? 'pt-2' : 'pt-6')}>{children}</View>
  ) : (
    <View
      className={cn(
        'overflow-hidden bg-card',
        item.isFirst && 'rounded-t-2xl',
        item.isLast && 'rounded-b-2xl',
      )}
      style={styles.cardSlice}
    >
      {children}
    </View>
  );
}
const ProviderListSlice = withPolicy(ProviderListSliceView, (policy) => ({
  managed: policy.managed,
}));

function ProviderSortableSlice({
  accessibilityActions,
  item,
  onAccessibilityAction,
  onOpen,
  onToggle,
}: {
  accessibilityActions?: AccessibilityProps['accessibilityActions'];
  item: Extract<ProviderListItem, { kind: 'provider' }>;
  onAccessibilityAction?: ViewProps['onAccessibilityAction'];
  onOpen: (provider: Provider) => void;
  onToggle: (provider: Provider, isEnabled: boolean) => void;
}) {
  return (
    <ProviderListSlice item={item}>
      {item.isFirst ? null : <SettingsGroupedSeparator />}
      <ProviderListRow
        accessibilityActions={accessibilityActions}
        isEnabled={item.isEnabled}
        isPending={item.isPending}
        onAccessibilityAction={onAccessibilityAction}
        onOpen={onOpen}
        onToggle={onToggle}
        provider={item.provider}
      />
    </ProviderListSlice>
  );
}

const keyExtractor = (item: ProviderListItem) => `${item.kind}:${item.id}`;
const getItemType = (item: ProviderListItem) => item.kind;

function ProviderListView({ canEditProviders = true }: { canEditProviders?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { isPreparing, openSetup } = useProviderSetup();
  const reducedMotion = useReducedMotion();
  const scroll = useSortableScrollController<LegendListRef>();
  const isNavigatingRef = useRef(false);
  const hasFocusedOnceRef = useRef(false);
  const pendingProviderIdsRef = useRef(new Set<string>());
  const [query, setQuery] = useState('');
  const [pendingProviderStates, setPendingProviderStates] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const keywords = useMemo(() => toSearchKeywords(query), [query]);
  const isFiltering = keywords.length > 0;
  const hasPendingProviderUpdate = pendingProviderStates.size > 0;
  const canReorderProviders = canEditProviders && !isFiltering && !hasPendingProviderUpdate;

  useFocusEffect(() => {
    if (!hasFocusedOnceRef.current) {
      hasFocusedOnceRef.current = true;
      return;
    }
    isNavigatingRef.current = false;
  });

  const { reorder: reorderProviders } = useReorder<Provider>({
    getId: (provider) => provider.id,
    onError: () => toast.show({ label: t('common.reorderFailed'), variant: 'danger' }),
    queryFilters: [
      dataApiCollectionFilters('/providers'),
      dataApiCollectionFilters('/providers/page'),
    ],
    resource: '/providers',
  });

  const updateProviderEnabledMutation = useMutation('PATCH', '/providers/:id', {
    refresh: ({ args }) =>
      args
        ? ['/providers', '/providers/page', `/providers/${args.params.id}`]
        : ['/providers', '/providers/page'],
  });
  const updateProviderEnabled = updateProviderEnabledMutation.trigger;
  const toggleProviderEnabled = useCallback(
    (provider: Provider, isEnabled: boolean) => {
      const needsSetup = isEnabled && provider.id !== CLOUD_PROVIDER_ID;
      if (
        provider.isEnabled === isEnabled ||
        pendingProviderIdsRef.current.has(provider.id) ||
        (needsSetup && isPreparing)
      ) {
        return;
      }

      pendingProviderIdsRef.current.add(provider.id);
      setPendingProviderStates((current) => new Map(current).set(provider.id, isEnabled));

      const update = needsSetup
        ? openSetup(provider.id, '/settings/provider')
        : updateProviderEnabled({
            body: { isEnabled },
            params: { id: provider.id },
          })
            .then(() => {
              toast.show({
                label: t(
                  isEnabled
                    ? 'settings.provider.toast.enabled'
                    : 'settings.provider.toast.disabled',
                  { name: provider.name },
                ),
                variant: 'success',
              });
            })
            .catch(() => {
              toast.show({ label: t('settings.provider.toast.toggleFailed'), variant: 'danger' });
            });

      void update.finally(() => {
        pendingProviderIdsRef.current.delete(provider.id);
        setPendingProviderStates((current) => {
          const next = new Map(current);
          next.delete(provider.id);
          return next;
        });
      });
    },
    [isPreparing, openSetup, t, toast, updateProviderEnabled],
  );

  const providersPageQuery = useInfiniteQuery('/providers/page', {
    limit: PROVIDER_LIST_PAGE_SIZE,
    staleTime: PROVIDER_LIST_STALE_TIME,
  });
  const loadNextProviderPage = providersPageQuery.loadNext;
  const pagedProviders = useMemo(
    () => providersPageQuery.pages.flatMap((page) => page.items),
    [providersPageQuery.pages],
  );
  const allProvidersQuery = useQuery('/providers', {
    enabled: isFiltering,
    staleTime: PROVIDER_LIST_STALE_TIME,
  });
  const listedProviders = useMemo(() => {
    const providers = isFiltering ? (allProvidersQuery.data ?? pagedProviders) : pagedProviders;
    return providers.filter(
      (provider) =>
        (provider.id !== CLOUD_PROVIDER_ID || !isEnterpriseProfile()) &&
        (!isFiltering || matchesSearchKeywords(keywords, [provider.name])),
    );
  }, [allProvidersQuery.data, isFiltering, keywords, pagedProviders]);
  const openProvider = useCallback(
    (provider: Provider) => {
      if (isNavigatingRef.current) {
        return;
      }

      isNavigatingRef.current = true;
      router.push({
        pathname: '/settings/provider/[providerId]',
        params: { providerId: provider.id, providerName: provider.name },
      });
    },
    [router],
  );

  const { disabledMovable, disabledMovableIds, enabledMovable, enabledMovableIds, providerItems } =
    useMemo(() => {
      const items: ProviderListItem[] = [];
      const enabledGroup: Provider[] = [];
      const disabledGroup: Provider[] = [];

      for (const isEnabled of [true, false]) {
        // Move once, using the persisted order after refresh. The switch responds immediately.
        const providers = listedProviders.filter((provider) => provider.isEnabled === isEnabled);
        const movableProviders = providers.filter((provider) => provider.id !== CLOUD_PROVIDER_ID);
        if (isEnabled) {
          enabledGroup.push(...movableProviders);
        } else {
          disabledGroup.push(...movableProviders);
        }

        const count = providers.length;
        if (count === 0) continue;

        items.push({
          id: isEnabled ? 'enabled' : 'disabled',
          kind: 'header',
          isFirst: items.length === 0,
          title: t(
            isEnabled ? 'settings.provider.section.enabled' : 'settings.provider.section.disabled',
            { count },
          ),
        });
        let movableCursor = 0;
        providers.forEach((provider, index) => {
          const isPinned = provider.id === CLOUD_PROVIDER_ID;
          const groupIndex = isPinned ? 0 : movableCursor++;
          items.push({
            id: provider.id,
            kind: 'provider',
            provider,
            groupId: isPinned ? 'pinned' : isEnabled ? 'enabled' : 'disabled',
            groupIndex,
            groupSize: isPinned ? 1 : movableProviders.length,
            isEnabled: pendingProviderStates.get(provider.id) ?? provider.isEnabled,
            isFirst: index === 0,
            isLast: index === providers.length - 1,
            isPending: pendingProviderStates.has(provider.id),
            isPinned,
          });
        });
      }

      const last = items.at(-1);
      if (last?.kind === 'provider') last.endsList = true;
      return {
        disabledMovable: disabledGroup,
        disabledMovableIds: disabledGroup.map((provider) => provider.id),
        enabledMovable: enabledGroup,
        enabledMovableIds: enabledGroup.map((provider) => provider.id),
        providerItems: items,
      };
    }, [listedProviders, pendingProviderStates, t]);

  const handleReorderProviderGroup = useCallback(
    (groupId: string, fromIndex: number, toIndex: number) => {
      if (!canReorderProviders) return;
      const group = groupId === 'enabled' ? enabledMovable : disabledMovable;
      if (group.length <= 1) return;
      void reorderProviders(group, reorderLocally(group, fromIndex, toIndex));
    },
    [canReorderProviders, disabledMovable, enabledMovable, reorderProviders],
  );

  const handleMoveToTop = useCallback(
    (groupId: string, fromIndex: number) => {
      handleReorderProviderGroup(groupId, fromIndex, 0);
    },
    [handleReorderProviderGroup],
  );

  const listExtraData = useMemo<ProviderListExtraData>(
    () => ({
      canEditProviders,
      canReorderProviders,
      onMoveToTop: handleMoveToTop,
    }),
    [canEditProviders, canReorderProviders, handleMoveToTop],
  );

  const renderProviderItem = useCallback(
    ({ extraData, item }: { extraData?: ProviderListExtraData; item: ProviderListItem }) => {
      if (item.kind === 'header') {
        return (
          <Sortable.Chrome>
            <ProviderListSlice item={item}>
              <Section.Header accessibilityRole="header" title={item.title} />
            </ProviderListSlice>
          </Sortable.Chrome>
        );
      }

      const canEdit = extraData?.canEditProviders ?? canEditProviders;
      const canReorder = extraData?.canReorderProviders ?? canReorderProviders;
      const canMove = !item.isPinned && canReorder && item.groupSize > 1;
      const menuItems: MenuItem[] = canEdit
        ? [
            {
              id: 'details',
              label: t('settings.provider.actions.details'),
              onPress: () => openProvider(item.provider),
            },
            ...(canMove && item.groupIndex > 0
              ? [
                  {
                    id: 'move-to-top',
                    label: t('common.moveToTop'),
                    onPress: () => extraData?.onMoveToTop(item.groupId, item.groupIndex),
                  },
                ]
              : []),
            {
              id: 'toggle-enabled',
              label: t(
                item.isEnabled
                  ? 'settings.provider.disableProvider'
                  : 'settings.provider.enableProvider',
              ),
              onPress: () => toggleProviderEnabled(item.provider, !item.isEnabled),
            },
          ]
        : [];

      return (
        <View className="mx-4">
          <Sortable.Item
            accessibilityLabels={{
              moveDown: t('common.moveDown', { name: item.provider.name }),
              moveToTop: t('common.moveToTop'),
              moveUp: t('common.moveUp', { name: item.provider.name }),
            }}
            disabled={!canEdit || item.isPending}
            estimatedHeight={PROVIDER_ROW_ESTIMATED_HEIGHT}
            groupId={item.groupId}
            groupSize={item.groupSize}
            id={item.provider.id}
            index={item.groupIndex}
            menuItems={menuItems}
            movable={canMove}
            renderOverlay={() => (
              <ProviderListRow
                isEnabled={item.isEnabled}
                isPending={item.isPending}
                onOpen={openProvider}
                onToggle={toggleProviderEnabled}
                provider={item.provider}
              />
            )}
          >
            <ProviderSortableSlice
              item={item}
              onOpen={openProvider}
              onToggle={toggleProviderEnabled}
            />
          </Sortable.Item>
        </View>
      );
    },
    [canEditProviders, canReorderProviders, openProvider, t, toggleProviderEnabled],
  );
  const loadMoreProviders = useCallback(() => {
    if (!isFiltering && !hasPendingProviderUpdate) {
      void loadNextProviderPage();
    }
  }, [hasPendingProviderUpdate, isFiltering, loadNextProviderPage]);
  const listFooter = useMemo(
    () =>
      providersPageQuery.isLoading ||
      providersPageQuery.isLoadingMore ||
      (isFiltering && allProvidersQuery.isPending) ? (
        <View className="h-16 items-center justify-center">
          <Spinner accessibilityLabel={t('settings.provider.loading')} />
        </View>
      ) : null,
    [
      allProvidersQuery.isPending,
      isFiltering,
      providersPageQuery.isLoading,
      providersPageQuery.isLoadingMore,
      t,
    ],
  );
  const openProviderCatalog = useCallback(() => {
    router.push('/settings/provider/catalog');
  }, [router]);
  const openDesktopSync = useCallback(() => {
    router.push({
      pathname: '/settings/provider/desktop-sync',
      params: { returnTo: '/settings/provider' },
    });
  }, [router]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'open-provider-catalog',
        label: t('settings.provider.actions.add'),
        onPress: openProviderCatalog,
      },
      {
        id: 'sync-from-desktop',
        label: t('settings.provider.desktopSync.menuLabel'),
        onPress: openDesktopSync,
      },
    ],
    [openDesktopSync, openProviderCatalog, t],
  );
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'provider-actions',
        nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
        testID: 'provider-actions',
        type: 'menu',
      },
    ],
    [menuItems, t],
  );

  return (
    <>
      <ProviderListHeader rightActions={rightActions} title={t('settings.pages.provider.title')} />
      <InlineSearch onChangeText={setQuery} value={query} />
      <View className="min-h-0 flex-1 pb-5">
        {providerItems.length > 0 ? (
          <Sortable.Root scrollController={scroll.controller} testID="provider-list-sortable">
            {({ isDragging }) => (
              <ScrollInteractionBoundary>
                {(scrollHandlers) => (
                  <>
                    {canReorderProviders && enabledMovable.length > 0 ? (
                      <Sortable.Group
                        estimatedItemHeight={PROVIDER_ROW_ESTIMATED_HEIGHT}
                        groupId="enabled"
                        itemIds={enabledMovableIds}
                        onReorder={({ fromIndex, toIndex }) =>
                          handleReorderProviderGroup('enabled', fromIndex, toIndex)
                        }
                      />
                    ) : null}
                    {canReorderProviders && disabledMovable.length > 0 ? (
                      <Sortable.Group
                        estimatedItemHeight={PROVIDER_ROW_ESTIMATED_HEIGHT}
                        groupId="disabled"
                        itemIds={disabledMovableIds}
                        onReorder={({ fromIndex, toIndex }) =>
                          handleReorderProviderGroup('disabled', fromIndex, toIndex)
                        }
                      />
                    ) : null}
                    <AnimatedLegendList
                      {...scrollHandlers}
                      alwaysBounceVertical={false}
                      data={providerItems}
                      estimatedItemSize={PROVIDER_ROW_ESTIMATED_HEIGHT}
                      extraData={listExtraData}
                      getItemType={getItemType}
                      itemLayoutAnimation={
                        reducedMotion || isDragging ? undefined : providerListTransition
                      }
                      keyboardDismissMode="on-drag"
                      keyboardShouldPersistTaps="handled"
                      keyExtractor={keyExtractor}
                      ListFooterComponent={listFooter}
                      maintainVisibleContentPosition={false}
                      onEndReached={loadMoreProviders}
                      onEndReachedThreshold={0.7}
                      onScroll={scroll.onScroll}
                      recycleItems
                      ref={scroll.setRef}
                      renderItem={renderProviderItem}
                      scrollEnabled={!isDragging}
                      showsVerticalScrollIndicator={false}
                      style={styles.list}
                      testID="provider-list"
                    />
                  </>
                )}
              </ScrollInteractionBoundary>
            )}
          </Sortable.Root>
        ) : (
          <View className="px-4">
            <Section>
              <Section.Item
                label={
                  providersPageQuery.isLoading || (isFiltering && allProvidersQuery.isPending)
                    ? t('settings.provider.loading')
                    : t('settings.provider.search.empty')
                }
              />
            </Section>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  cardSlice: {
    borderCurve: 'continuous',
  },
  list: {
    flex: 1,
  },
});

const PolicyAwareProviderListView = withPolicy(ProviderListView, (policy) => ({
  canEditProviders: policy.canEdit('provider'),
}));

/** The organization configures every provider of an enterprise profile; rows still open details. */
export default withResourcePolicy(PolicyAwareProviderListView, () =>
  capabilityPolicy('providerSettings'),
);
