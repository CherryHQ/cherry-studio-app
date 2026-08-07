import { Button, Section, Spinner } from '@cherrystudio/ui/components';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { MinusIcon, PlusIcon } from 'lucide-uniwind/png';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { useProviderDetailSettings } from './detail';
import {
  ProviderModelRow,
  providerModelRowEstimatedHeight,
} from './models/components/ProviderModelRow';
import { ProviderModelSearchField } from './models/components/ProviderModelSearchField';
import { ProviderModelTypeFilterBar } from './models/components/ProviderModelTypeFilterBar';
import { useProviderModelPull } from './models/hooks/useProviderModelPull';
import {
  type ProviderModelPullApplyChange,
  useProviderModelPullApply,
} from './models/hooks/useProviderModelPullApply';
import {
  buildProviderModelPullListItems,
  filterProviderModelPullPreview,
  type ProviderModelPullListItem,
  type ProviderModelPullPreview,
  type ProviderModelPullSectionKey,
} from './models/utils/providerModelPullPreview';
import { consumeProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';
import {
  filterModelsByProviderModelType,
  getProviderModelTypeCounts,
  type ProviderModelTypeFilter,
} from './models/utils/providerModelTypeFilter';

type PullTranslator = ReturnType<typeof useTranslation>['t'];

type PullListExtraData = {
  appliedIds: ReadonlySet<UniqueModelId>;
  displayedPreview: ProviderModelPullPreview;
  onToggleModel: (model: Model, section: ProviderModelPullSectionKey) => void;
  onToggleSection: (models: readonly Model[], section: ProviderModelPullSectionKey) => void;
  pendingIds: ReadonlySet<UniqueModelId>;
  provider: Provider | undefined;
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
      <BackHeader title={t('settings.provider.models.pullPreviewTitle')} />
      {preview ? (
        <ProviderModelPullPreviewPage
          applyModelChange={applyModelChange}
          preview={preview}
          provider={provider}
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
  preview,
  provider,
}: {
  applyModelChange: ProviderModelPullApplyChange;
  preview: ProviderModelPullPreview;
  provider: Provider | undefined;
}) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [typeFilter, setTypeFilter] = useState<ProviderModelTypeFilter>('all');
  const missingCount = preview.missing.length;
  const searchedPreview = useMemo(
    () => filterProviderModelPullPreview(preview, deferredSearchText),
    [deferredSearchText, preview],
  );
  const displayedPreview = useMemo(
    () => ({
      added: filterModelsByProviderModelType(searchedPreview.added, typeFilter),
      missing: filterModelsByProviderModelType(searchedPreview.missing, typeFilter),
    }),
    [searchedPreview, typeFilter],
  );
  // Counted over what the search left behind but before the type filter, so a
  // tab's number says how many models picking it would show.
  const typeCounts = useMemo(
    () => getProviderModelTypeCounts([...searchedPreview.added, ...searchedPreview.missing]),
    [searchedPreview],
  );
  const { appliedIds, pendingIds, toggleModel, toggleSection } = useProviderModelPullApply({
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
      appliedIds,
      displayedPreview,
      onToggleModel: toggleModel,
      onToggleSection: toggleSection,
      pendingIds,
      provider,
      t,
    }),
    [appliedIds, displayedPreview, pendingIds, provider, t, toggleModel, toggleSection],
  );
  const isSearchEmpty = displayedPreview.added.length + displayedPreview.missing.length === 0;

  return (
    <>
      {process.env.EXPO_OS === 'ios' ? (
        <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
      ) : null}
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
        ListFooterComponent={
          isSearchEmpty ? (
            <View className="items-center justify-center px-4 py-10">
              <Text className="text-center text-base text-foreground">
                {t('settings.provider.models.search.empty')}
              </Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          // One gap for the whole screen: the Android search field, the filter
          // bar and the first section are all 12 apart.
          <View className="gap-3 pb-3">
            {process.env.EXPO_OS === 'ios' ? null : (
              <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
            )}
            <ProviderModelTypeFilterBar
              counts={typeCounts}
              selectedFilter={typeFilter}
              onSelect={setTypeFilter}
            />
          </View>
        }
        maintainVisibleContentPosition={false}
        recycleItems
        renderItem={renderPullListItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </>
  );
}

function pullListKeyExtractor(item: ProviderModelPullListItem) {
  return item.key;
}

function getPullListItemType(item: ProviderModelPullListItem) {
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
    const isEverythingApplied =
      sectionModels.length > 0 && sectionModels.every((model) => listData.appliedIds.has(model.id));
    // Both sections offer the same undo, they just start from opposite ends.
    const actionLabelKey = isAddedSection
      ? isEverythingApplied
        ? 'settings.provider.models.pullRemoveAll'
        : 'settings.provider.models.pullAddAll'
      : isEverythingApplied
        ? 'settings.provider.models.pullRestoreAll'
        : 'settings.provider.models.pullRemoveAll';

    return (
      <PullSectionHeader
        actionLabel={listData.t(actionLabelKey)}
        count={sectionModels.length}
        isFirstSection={item.isFirstSection}
        title={listData.t(
          isAddedSection
            ? 'settings.provider.models.pullAddedSection'
            : 'settings.provider.models.pullMissingSection',
        )}
        onActionPress={() => listData.onToggleSection(sectionModels, item.section)}
      />
    );
  }

  return (
    <PullModelRow
      isApplied={listData.appliedIds.has(item.model.id)}
      isFirst={item.isFirst}
      isLast={item.isLast}
      isPending={listData.pendingIds.has(item.model.id)}
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
    <Section.Header className={isFirstSection ? 'pb-2' : 'mt-3 pb-2'} title={`${title} (${count})`}>
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        className="shrink-0 justify-center px-1 active:opacity-60 disabled:opacity-40"
        disabled={count === 0}
        hitSlop={6}
        onPress={onActionPress}
      >
        <Text className="font-medium text-primary text-sm">{actionLabel}</Text>
      </Pressable>
    </Section.Header>
  );
}

const PullModelRow = memo(function PullModelRow({
  isApplied,
  isFirst,
  isLast,
  isPending,
  model,
  onToggleModel,
  provider,
  section,
}: {
  isApplied: boolean;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  model: Model;
  onToggleModel: (model: Model, section: ProviderModelPullSectionKey) => void;
  provider: Provider | undefined;
  section: ProviderModelPullSectionKey;
}) {
  const { t } = useTranslation();
  const isMissing = section === 'missing';
  const handleToggle = useCallback(() => {
    onToggleModel(model, section);
  }, [model, onToggleModel, section]);
  // `added` rows start out absent and gain a model; `missing` rows start out
  // present and lose one. Either way "applied" means the tap already landed.
  const showsMinus = isMissing ? !isApplied : isApplied;

  return (
    <ProviderModelRow
      isFirst={isFirst}
      isLast={isLast}
      model={model}
      provider={provider}
      // Desktop tints the whole row once the model is in the provider.
      surfaceClassName={isApplied && !isMissing ? 'bg-success/10' : undefined}
      tone={isMissing && !isApplied ? 'struck' : 'default'}
    >
      <Button
        accessibilityLabel={t(
          showsMinus ? 'settings.provider.models.remove' : 'settings.provider.models.add',
        )}
        accessibilityState={{ busy: isPending }}
        disabled={isPending}
        hitSlop={6}
        icon={
          showsMinus ? (
            <MinusIcon className="text-destructive" strokeWidth={2} />
          ) : (
            <PlusIcon className="text-primary" strokeWidth={2} />
          )
        }
        onPress={handleToggle}
        size="sm"
        variant="ghost"
      />
    </ProviderModelRow>
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
