import { Section, Spinner } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSearchButton, useAppSearch } from '@/frontend/components/appSearch';
import { ModelAvatar } from '@/frontend/components/avatar';
import { RouteHeader } from '@/frontend/components/headers';
import {
  filterModelsByType,
  getModelTypeCounts,
  ModelTypeFilterBar,
  type ModelTypeCounts,
  type ModelTypeFilter,
  ModelTypeSearchFilter,
} from '@/frontend/components/modelPicker';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useProviderDetailSettings } from './detail';
import { ProviderModelPullChrome } from './models/components/ProviderModelPullChrome/ProviderModelPullChrome';
import {
  ProviderModelRow,
  providerModelRowEstimatedHeight,
} from './models/components/ProviderModelRow';
import { useProviderModelPull } from './models/hooks/useProviderModelPull';
import {
  type ProviderModelPullApplyChange,
  useProviderModelPullSelection,
} from './models/hooks/useProviderModelPullSelection';
import {
  buildProviderModelPullListItems,
  filterProviderModelPullPreview,
  type ProviderModelPullListItem,
  type ProviderModelPullPreview,
  type ProviderModelPullSectionKey,
} from './models/utils/providerModelPullPreview';
import { consumeProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

type PullTranslator = ReturnType<typeof useTranslation>['t'];

type ProviderModelPullSearchItem = {
  key: string;
  model: Model;
  section: ProviderModelPullSectionKey;
};

type PullListExtraData = {
  displayedPreview: ProviderModelPullPreview;
  isApplying: boolean;
  onToggleAll: (ids: readonly UniqueModelId[]) => void;
  onToggleModel: (id: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedIds: ReadonlySet<UniqueModelId>;
  t: PullTranslator;
};

export default function ProviderModelPullScreen() {
  const { providerId, providerName, returnToConfiguration } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
    returnToConfiguration?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [initialPreview] = useState(() =>
    providerId ? consumeProviderModelPullPreview(providerId) : null,
  );
  const loadStartedRef = useRef(Boolean(initialPreview));
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const { applyModelChange, isPreviewLoading, loadPullPreview, preview } = useProviderModelPull({
    initialPreview,
    providerId: providerId ?? '',
  });
  const leavePullScreen = useCallback(() => {
    if (providerId && returnToConfiguration === 'true') {
      router.replace({
        params: {
          ...(providerName ? { providerName } : {}),
          providerId,
        },
        pathname: '/settings/provider/[providerId]',
      });
      return;
    }

    router.back();
  }, [providerId, providerName, returnToConfiguration, router]);

  useEffect(() => {
    if (!provider || !providerId || loadStartedRef.current) {
      return;
    }

    let isActive = true;
    loadStartedRef.current = true;
    void loadPullPreview().then((result) => {
      if (!isActive) {
        return;
      }

      if (result !== 'ready') {
        leavePullScreen();
      }
    });

    return () => {
      isActive = false;
    };
  }, [leavePullScreen, loadPullPreview, provider, providerId]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <RouteHeader title={t('settings.provider.models.pullPreviewTitle')} />
      {preview ? (
        <ProviderModelPullPreviewPage
          applyModelChange={applyModelChange}
          preview={preview}
          provider={provider}
          onApplied={leavePullScreen}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 px-4">
          <Spinner />
          <Text className="text-base text-foreground">
            {isPreviewLoading || providerQuery.isPending
              ? t('settings.provider.models.loading')
              : t('settings.provider.models.pull')}
          </Text>
        </View>
      )}
    </>
  );
}

function ProviderModelPullPreviewPage({
  applyModelChange,
  onApplied,
  preview,
  provider,
}: {
  applyModelChange: ProviderModelPullApplyChange;
  /** The pull is over once its changes land, so the screen has nothing left to show. */
  onApplied: () => void;
  preview: ProviderModelPullPreview;
  provider: Provider | undefined;
}) {
  const { t } = useTranslation();
  const { open: openAppSearch } = useAppSearch();
  const [typeFilter, setTypeFilter] = useState<ModelTypeFilter>('all');
  const missingCount = preview.missing.length;
  const displayedPreview = useMemo(
    () => ({
      added: filterModelsByType(preview.added, typeFilter),
      missing: filterModelsByType(preview.missing, typeFilter),
    }),
    [preview, typeFilter],
  );
  const typeCounts = useMemo(
    () => getModelTypeCounts([...preview.added, ...preview.missing]),
    [preview],
  );
  const { applySelection, isApplying, selectedIds, toggleAll, toggleModel } =
    useProviderModelPullSelection({
      applyModelChange,
      preview,
    });
  const visibleSections = useMemo<ProviderModelPullSectionKey[]>(
    () => (missingCount > 0 ? ['added', 'missing'] : ['added']),
    [missingCount],
  );
  const listItems = useMemo(
    () => buildProviderModelPullListItems(displayedPreview, visibleSections),
    [displayedPreview, visibleSections],
  );
  const listExtraData = useMemo<PullListExtraData>(
    () => ({
      displayedPreview,
      isApplying,
      onToggleAll: toggleAll,
      onToggleModel: toggleModel,
      provider,
      selectedIds,
      t,
    }),
    [displayedPreview, isApplying, provider, selectedIds, t, toggleAll, toggleModel],
  );
  // Everything the type filter leaves on screen; search selects and returns one
  // item, so it no longer changes the scope of this screen's select-all action.
  const displayedIds = useMemo(
    () => [...displayedPreview.added, ...displayedPreview.missing].map((model) => model.id),
    [displayedPreview],
  );
  const handleApply = useCallback(() => {
    void applySelection().then((didApply) => {
      if (didApply) {
        onApplied();
      }
    });
  }, [applySelection, onApplied]);
  const openModelSearch = useCallback(() => {
    void openAppSearch<ProviderModelPullSearchItem, ModelTypeFilter, ModelTypeCounts>({
      emptyText: t('settings.provider.models.search.empty'),
      filter: {
        component: ModelTypeSearchFilter,
        context: typeCounts,
        initialValue: typeFilter,
      },
      getAccessibilityLabel: (item) => item.model.name,
      keyExtractor: (item) => item.key,
      placeholder: t('modelPicker.searchPlaceholder'),
      renderItem: (item) => <ProviderModelPullSearchResult item={item} provider={provider} />,
      search: ({ filters, query }) => {
        const searchedPreview = filterProviderModelPullPreview(preview, query);
        const added = filterModelsByType(searchedPreview.added, filters).map((model) => ({
          key: `added:${model.id}`,
          model,
          section: 'added' as const,
        }));
        const missing = filterModelsByType(searchedPreview.missing, filters).map((model) => ({
          key: `missing:${model.id}`,
          model,
          section: 'missing' as const,
        }));

        return {
          groups: [
            ...(added.length > 0
              ? [
                  {
                    items: added,
                    key: 'added',
                    title: t('settings.provider.models.pullAddedSection'),
                  },
                ]
              : []),
            ...(missing.length > 0
              ? [
                  {
                    items: missing,
                    key: 'missing',
                    title: t('settings.provider.models.pullMissingSection'),
                  },
                ]
              : []),
          ],
        };
      },
    }).then((outcome) => {
      if (outcome.type === 'selected') {
        toggleModel(outcome.item.model.id);
      }
    });
  }, [openAppSearch, preview, provider, t, toggleModel, typeCounts, typeFilter]);

  return (
    <>
      <LegendList
        alwaysBounceVertical={false}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        data={listItems}
        drawDistance={320}
        estimatedItemSize={providerModelRowEstimatedHeight}
        extraData={listExtraData}
        getItemType={getPullListItemType}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={pullListKeyExtractor}
        ListHeaderComponent={
          <View className="flex-row items-center gap-3 px-4 py-3">
            <View className="min-w-0 flex-1">
              <ModelTypeFilterBar
                counts={typeCounts}
                selectedFilter={typeFilter}
                onSelect={setTypeFilter}
              />
            </View>
            <AppSearchButton
              accessibilityLabel={t('navigation.search')}
              disabled={isApplying}
              onPress={openModelSearch}
            />
          </View>
        }
        maintainVisibleContentPosition={false}
        recycleItems
        renderItem={renderPullListItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
      <ProviderModelPullChrome
        isAllSelected={displayedIds.length > 0 && displayedIds.every((id) => selectedIds.has(id))}
        isApplying={isApplying}
        selectedCount={selectedIds.size}
        onApply={handleApply}
        onToggleAll={() => toggleAll(displayedIds)}
      />
    </>
  );
}

function ProviderModelPullSearchResult({
  item,
  provider,
}: {
  item: ProviderModelPullSearchItem;
  provider: Provider | undefined;
}) {
  return (
    <View className="min-h-12 flex-row items-center gap-3">
      <ModelAvatar model={item.model} provider={provider} />
      <Text
        className={
          item.section === 'missing'
            ? 'min-w-0 flex-1 text-base text-foreground line-through'
            : 'min-w-0 flex-1 text-base text-foreground'
        }
        numberOfLines={1}
      >
        {item.model.name}
      </Text>
    </View>
  );
}

function pullListKeyExtractor(item: ProviderModelPullListItem) {
  return item.key;
}

function getPullListItemType(item: ProviderModelPullListItem) {
  // A section header is shorter than a model row, so the virtualizer sizes the
  // two separately.
  return item.type;
}

function renderPullListItem({
  extraData,
  item,
}: LegendListRenderItemProps<ProviderModelPullListItem>) {
  const listData = extraData as PullListExtraData;

  if (item.type === 'section') {
    const isAddedSection = item.section === 'added';
    const sectionModels = isAddedSection
      ? listData.displayedPreview.added
      : listData.displayedPreview.missing;
    const sectionIds = sectionModels.map((model) => model.id);
    // The two sections pull in opposite directions — one adds models, the other
    // drops them — so each keeps its own select-all beside the toolbar's.
    const isSectionSelected =
      sectionIds.length > 0 && sectionIds.every((id) => listData.selectedIds.has(id));

    return (
      <PullSectionHeader
        actionLabel={listData.t(
          isSectionSelected
            ? 'settings.provider.models.selection.deselectAll'
            : 'settings.provider.models.selection.selectAll',
        )}
        count={sectionModels.length}
        isFirstSection={item.isFirstSection}
        title={listData.t(
          isAddedSection
            ? 'settings.provider.models.pullAddedSection'
            : 'settings.provider.models.pullMissingSection',
        )}
        onActionPress={() => listData.onToggleAll(sectionIds)}
      />
    );
  }

  return (
    <PullModelRow
      isApplying={listData.isApplying}
      isSelected={listData.selectedIds.has(item.model.id)}
      model={item.model}
      provider={listData.provider}
      section={item.section}
      onToggleModel={listData.onToggleModel}
    />
  );
}

function PullSectionHeader({
  actionLabel,
  count,
  isFirstSection,
  onActionPress,
  title,
}: {
  actionLabel: string;
  count: number;
  isFirstSection: boolean;
  onActionPress: () => void;
  title: string;
}) {
  return (
    // `px-4` rather than the header's own `px-3`, so the title starts where the
    // model names below it do.
    <Section.Header
      className={isFirstSection ? 'px-4 pb-2' : 'mt-3 px-4 pb-2'}
      title={`${title} (${count})`}
    >
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        className="shrink-0 justify-center px-1 active:opacity-60 disabled:opacity-40"
        disabled={count === 0}
        hitSlop={6}
        onPress={onActionPress}
      >
        <Text className="font-medium text-foreground text-sm">{actionLabel}</Text>
      </Pressable>
    </Section.Header>
  );
}

const PullModelRow = memo(function PullModelRow({
  isApplying,
  isSelected,
  model,
  onToggleModel,
  provider,
  section,
}: {
  isApplying: boolean;
  isSelected: boolean;
  model: Model;
  onToggleModel: (id: UniqueModelId) => void;
  provider: Provider | undefined;
  section: ProviderModelPullSectionKey;
}) {
  const handleToggle = useCallback(() => {
    onToggleModel(model.id);
  }, [model.id, onToggleModel]);

  return (
    <ProviderModelRow
      model={model}
      provider={provider}
      selection={{ isDisabled: isApplying, isSelected, onToggle: handleToggle }}
      // The provider no longer serves it, whether or not the row is ticked.
      tone={section === 'missing' ? 'struck' : 'default'}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  // No horizontal padding: the model rows carry their own `px-4`, so an outer
  // inset would push their content twice as far in as the navigation chrome
  // above them. Everything else here pads itself to match. The bottom clears
  // the select-all/apply bar, which floats over the list.
  listContent: {
    paddingBottom: 96,
  },
});
