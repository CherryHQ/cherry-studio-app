import { LegendList } from '@legendapp/list/react-native';
import { ModalBottomSheet, programmatic } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import { Button } from 'heroui-native/button';
import { Checkbox } from 'heroui-native/checkbox';
import { cn } from 'heroui-native/utils';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModelPickerIcon, type ModelPickerModelItem } from '@/components/modelPicker';
import { ModelPickerTagChip } from '@/components/modelPicker/components/ModelPickerTagChip';
import {
  getModelPickerTags,
  type ModelPickerTag,
} from '@/components/modelPicker/utils/modelPickerData';
import { isLiquidGlassAvailable } from '@/config/constants';
import type { Model, UniqueModelId } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import {
  buildProviderModelPullApplyPayload,
  createDefaultProviderModelPullSelection,
  type ProviderModelPullApplyPayload,
  type ProviderModelPullPreview,
  type ProviderModelPullSelection,
} from '../utils/providerModelPullPreview';

const pullSheetSnapPointFraction = 0.85;
// Detent indices into `detents`: 0 closed, 1 open.
const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const defaultHeaderHeight = 56;
const defaultFooterHeight = 76;
const sectionHeaderHeight = 30;
const modelRowHeight = 56;

type ProviderModelPullSheetProps = {
  isApplying: boolean;
  isOpen: boolean;
  onApply: (payload: ProviderModelPullApplyPayload) => Promise<void> | void;
  onClose: () => void;
  preview: ProviderModelPullPreview | null;
  provider: Provider | undefined;
};

type ProviderModelPullSelectionOverride = ProviderModelPullSelection & {
  previewKey: string;
};

export function ProviderModelPullSheet({
  isApplying,
  isOpen,
  onApply,
  onClose,
  preview,
  provider,
}: ProviderModelPullSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [selectionOverride, setSelectionOverride] =
    useState<ProviderModelPullSelectionOverride | null>(null);
  // Adjusted during render (not an effect) from `isOpen`, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const previewKey = useMemo(() => getPreviewKey(preview), [preview]);
  const defaultSelection = useMemo(
    () =>
      preview
        ? createDefaultProviderModelPullSelection(preview)
        : { addedIds: new Set<UniqueModelId>(), missingIds: new Set<UniqueModelId>() },
    [preview],
  );
  const selection =
    selectionOverride?.previewKey === previewKey ? selectionOverride : defaultSelection;
  const selectedAddedIds = selection.addedIds;
  const selectedMissingIds = selection.missingIds;

  const sheetHeight = (windowHeight - insets.top - insets.bottom) * pullSheetSnapPointFraction;
  const listHeight = Math.max(
    sheetHeight - (headerHeight || defaultHeaderHeight) - (footerHeight || defaultFooterHeight),
    160,
  );
  const addedCount = preview?.added.length ?? 0;
  const missingCount = preview?.missing.length ?? 0;
  const selectedTotal = selectedAddedIds.size + selectedMissingIds.size;
  const totalRows = addedCount + missingCount;
  const isAllSelected = selectedTotal === totalRows && totalRows > 0;
  const allAddedSelected = addedCount > 0 && selectedAddedIds.size === addedCount;
  const allMissingSelected = missingCount > 0 && selectedMissingIds.size === missingCount;
  const applyLabel = isAllSelected
    ? t('settings.provider.models.pullApplyAll')
    : t('settings.provider.models.pullApplySelected');
  const sectionListHeights = useMemo(
    () =>
      calculateSectionListHeights({
        addedCount,
        listHeight,
        missingCount,
      }),
    [addedCount, listHeight, missingCount],
  );

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setSheetIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  }

  const handleClose = useCallback(() => {
    setSelectionOverride(null);
    onClose();
  }, [onClose]);
  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setHeaderHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
  }, []);
  const handleFooterLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setFooterHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
  }, []);
  const handleApply = useCallback(() => {
    if (!preview) {
      return;
    }

    const payload = buildProviderModelPullApplyPayload(preview, {
      addedIds: selectedAddedIds,
      missingIds: selectedMissingIds,
    });
    if (!payload) {
      return;
    }

    setSheetIndex(CLOSED_INDEX);
    void onApply(payload);
  }, [onApply, preview, selectedAddedIds, selectedMissingIds]);
  const toggleAddedSelection = useCallback(
    (modelId: UniqueModelId) => {
      setSelectionOverride((current) => {
        const baseSelection = getSelectionForUpdate(current, previewKey, {
          addedIds: selectedAddedIds,
          missingIds: selectedMissingIds,
        });
        return {
          ...baseSelection,
          addedIds: toggleSetItem(baseSelection.addedIds, modelId),
        };
      });
    },
    [previewKey, selectedAddedIds, selectedMissingIds],
  );
  const toggleMissingSelection = useCallback(
    (modelId: UniqueModelId) => {
      setSelectionOverride((current) => {
        const baseSelection = getSelectionForUpdate(current, previewKey, {
          addedIds: selectedAddedIds,
          missingIds: selectedMissingIds,
        });
        return {
          ...baseSelection,
          missingIds: toggleSetItem(baseSelection.missingIds, modelId),
        };
      });
    },
    [previewKey, selectedAddedIds, selectedMissingIds],
  );
  const toggleAllAdded = useCallback(() => {
    if (!preview) {
      return;
    }

    setSelectionOverride({
      addedIds: allAddedSelected ? new Set() : new Set(preview.added.map((model) => model.id)),
      missingIds: selectedMissingIds,
      previewKey,
    });
  }, [allAddedSelected, preview, previewKey, selectedMissingIds]);
  const toggleAllMissing = useCallback(() => {
    if (!preview) {
      return;
    }

    setSelectionOverride({
      addedIds: selectedAddedIds,
      missingIds: allMissingSelected
        ? new Set()
        : new Set(preview.missing.map((model) => model.id)),
      previewKey,
    });
  }, [allMissingSelected, preview, previewKey, selectedAddedIds]);

  if (!preview && !isOpen) {
    return null;
  }

  return (
    <ModalBottomSheet
      detents={[isApplying ? programmatic(0) : 0, sheetHeight]}
      index={sheetIndex}
      nativeOverlay
      onIndexChange={setSheetIndex}
      onSettle={(nextIndex) => {
        if (nextIndex === CLOSED_INDEX) {
          handleClose();
        }
      }}
      surface={
        isLiquidGlassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            style={[StyleSheet.absoluteFill, styles.surfaceGlass]}
          />
        ) : (
          <View className="rounded-t-3xl bg-background" style={StyleSheet.absoluteFill} />
        )
      }
    >
      <View style={styles.sheetContent}>
        <View style={[styles.sheetViewport, { height: sheetHeight }]}>
          <View className="px-4 pb-3 pt-5" onLayout={handleHeaderLayout}>
            <Text className="font-semibold text-foreground text-lg" numberOfLines={1}>
              {t('settings.provider.models.pullPreviewTitle')}
            </Text>
          </View>

          <View style={[styles.listViewport, { height: listHeight }]}>
            <View style={styles.sectionsContainer}>
              {preview?.added.length ? (
                <PullSection
                  actionLabel={t(
                    allAddedSelected
                      ? 'settings.provider.models.pullDeselectAll'
                      : 'settings.provider.models.pullSelectAll',
                  )}
                  count={preview.added.length}
                  isDisabled={isApplying}
                  kind="added"
                  listHeight={sectionListHeights.added}
                  models={preview.added}
                  provider={provider}
                  selectedIds={selectedAddedIds}
                  title={t('settings.provider.models.pullAddedSection')}
                  onActionPress={toggleAllAdded}
                  onToggleModel={toggleAddedSelection}
                />
              ) : null}

              {preview?.missing.length ? (
                <PullSection
                  actionLabel={t(
                    allMissingSelected
                      ? 'settings.provider.models.pullDeselectAll'
                      : 'settings.provider.models.pullSelectAll',
                  )}
                  count={preview.missing.length}
                  isDisabled={isApplying}
                  kind="missing"
                  listHeight={sectionListHeights.missing}
                  models={preview.missing}
                  provider={provider}
                  selectedIds={selectedMissingIds}
                  title={t('settings.provider.models.pullMissingSection')}
                  onActionPress={toggleAllMissing}
                  onToggleModel={toggleMissingSelection}
                />
              ) : null}
            </View>
          </View>

          <View
            className="flex-row items-center gap-3 px-4 pb-4 pt-2"
            onLayout={handleFooterLayout}
          >
            <Button
              className="h-9 min-h-0 flex-1 rounded-lg"
              isDisabled={isApplying}
              variant="secondary"
              onPress={handleClose}
            >
              <Text className="font-medium text-foreground text-sm">{t('common.cancel')}</Text>
            </Button>
            <Button
              className="h-9 min-h-0 flex-1 rounded-lg"
              isDisabled={isApplying || selectedTotal === 0}
              variant="primary"
              onPress={handleApply}
            >
              <Text className="font-medium text-sm text-white">{applyLabel}</Text>
            </Button>
          </View>
        </View>
      </View>
    </ModalBottomSheet>
  );
}

function PullSection({
  actionLabel,
  count,
  isDisabled,
  kind,
  listHeight,
  models,
  onActionPress,
  onToggleModel,
  provider,
  selectedIds,
  title,
}: {
  actionLabel: string;
  count: number;
  isDisabled: boolean;
  kind: 'added' | 'missing';
  listHeight: number;
  models: Model[];
  onActionPress: () => void;
  onToggleModel: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedIds: Set<UniqueModelId>;
  title: string;
}) {
  const listExtraData = useMemo(
    () => ({
      isDisabled,
      provider,
      selectedIds,
    }),
    [isDisabled, provider, selectedIds],
  );
  const renderItem = useCallback(
    ({ item }: { item: Model }) => (
      <PullModelRow
        isDisabled={isDisabled}
        isMissing={kind === 'missing'}
        isSelected={selectedIds.has(item.id)}
        model={item}
        provider={provider}
        onToggleModel={onToggleModel}
      />
    ),
    [isDisabled, kind, onToggleModel, provider, selectedIds],
  );
  const keyExtractor = useCallback((model: Model) => model.id, []);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3 px-1">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="font-medium text-default-foreground text-sm" numberOfLines={1}>
            {title} ({count})
          </Text>
        </View>
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          className="px-1 py-1 active:opacity-60 disabled:opacity-40"
          disabled={isDisabled}
          hitSlop={6}
          onPress={onActionPress}
        >
          <Text className="font-medium text-accent text-sm">{actionLabel}</Text>
        </Pressable>
      </View>
      <View className="overflow-hidden rounded-xl" style={{ height: listHeight }}>
        <LegendList
          data={models}
          drawDistance={220}
          estimatedItemSize={modelRowHeight}
          extraData={listExtraData}
          getFixedItemSize={() => modelRowHeight}
          keyExtractor={keyExtractor}
          maintainVisibleContentPosition={false}
          nestedScrollEnabled
          recycleItems
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          style={styles.legendList}
        />
      </View>
    </View>
  );
}

const PullModelRow = memo(function PullModelRow({
  isDisabled,
  isMissing,
  isSelected,
  model,
  onToggleModel,
  provider,
}: {
  isDisabled: boolean;
  isMissing: boolean;
  isSelected: boolean;
  model: Model;
  onToggleModel: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
}) {
  const tags = useMemo(() => getPullModelTags(model), [model]);
  const handleToggle = useCallback(() => {
    onToggleModel(model.id);
  }, [model.id, onToggleModel]);
  const modelPickerItem = useMemo<ModelPickerModelItem | null>(() => {
    if (!provider) {
      return null;
    }

    return {
      isPinned: false,
      key: `${model.id}:pull`,
      model,
      modelId: model.id,
      modelIdentifier: model.modelId,
      provider,
      showIdentifier: model.modelId !== model.name,
    };
  }, [model, provider]);

  return (
    <Pressable
      accessibilityLabel={model.name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      className="flex-row items-center gap-3 bg-transparent px-0 py-2 active:opacity-60 disabled:opacity-40"
      disabled={isDisabled}
      onPress={handleToggle}
      style={styles.modelRow}
    >
      {modelPickerItem ? (
        <ModelPickerIcon item={modelPickerItem} />
      ) : (
        <PullModelFallbackIcon model={model} />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'min-w-0 shrink text-base',
            isMissing ? 'text-default-foreground line-through' : 'text-foreground',
          )}
          numberOfLines={1}
        >
          {model.name}
        </Text>
        <Text
          className={cn(
            'min-w-0 shrink text-default-foreground text-xs',
            isMissing ? 'line-through' : null,
          )}
          numberOfLines={1}
        >
          {model.modelId}
        </Text>
      </View>
      {tags.length > 0 ? (
        <View className="min-h-5 max-w-28 shrink-0 flex-row items-center justify-end gap-1 overflow-hidden">
          {tags.slice(0, 4).map((tag) => (
            <ModelPickerTagChip key={`${model.id}:${tag}`} tag={tag} />
          ))}
        </View>
      ) : null}
      <View className="size-8 items-center justify-center">
        <Checkbox
          isDisabled={isDisabled}
          isSelected={isSelected}
          variant="secondary"
          onPress={(event) => event.stopPropagation()}
          onSelectedChange={handleToggle}
        />
      </View>
    </Pressable>
  );
});

function PullModelFallbackIcon({ model }: { model: Model }) {
  const initial = model.name.trim().charAt(0).toUpperCase() || 'M';

  return (
    <View className="size-8 items-center justify-center rounded-full">
      <Text className="font-medium text-default-foreground text-xs">{initial}</Text>
    </View>
  );
}

function getPullModelTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);
  return isFreePullModel(model) && !tags.includes('free') ? [...tags, 'free'] : tags;
}

function isFreePullModel(model: Model) {
  return [model.id, model.modelId, model.name, model.presetModelId]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes('free');
}

function toggleSetItem<TItem>(items: Set<TItem>, item: TItem): Set<TItem> {
  const next = new Set(items);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

function getPreviewKey(preview: ProviderModelPullPreview | null): string {
  if (!preview) {
    return '';
  }

  return [
    ...preview.added.map((model) => `added:${model.id}`),
    ...preview.missing.map((model) => `missing:${model.id}`),
  ].join('|');
}

function getSelectionForUpdate(
  current: ProviderModelPullSelectionOverride | null,
  previewKey: string,
  fallback: ProviderModelPullSelection,
): ProviderModelPullSelectionOverride {
  if (current?.previewKey === previewKey) {
    return current;
  }

  return {
    ...fallback,
    previewKey,
  };
}

function calculateSectionListHeights({
  addedCount,
  listHeight,
  missingCount,
}: {
  addedCount: number;
  listHeight: number;
  missingCount: number;
}) {
  const sections = [addedCount, missingCount].filter((count) => count > 0);
  const sectionCount = sections.length;
  if (sectionCount === 0) {
    return { added: 0, missing: 0 };
  }

  const availableListHeight = Math.max(
    listHeight - sectionCount * sectionHeaderHeight,
    modelRowHeight * sectionCount,
  );

  if (sectionCount === 1) {
    const height = Math.max(availableListHeight, modelRowHeight);
    return {
      added: addedCount > 0 ? height : 0,
      missing: missingCount > 0 ? height : 0,
    };
  }

  const addedWeight = Math.min(addedCount, 8);
  const missingWeight = Math.min(missingCount, 8);
  const totalWeight = addedWeight + missingWeight;

  return {
    added: Math.max(modelRowHeight, Math.round((availableListHeight * addedWeight) / totalWeight)),
    missing: Math.max(
      modelRowHeight,
      Math.round((availableListHeight * missingWeight) / totalWeight),
    ),
  };
}

const styles = StyleSheet.create({
  legendList: {
    flex: 1,
  },
  listViewport: {
    minHeight: 0,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  sectionsContainer: {
    flex: 1,
  },
  modelRow: {
    height: modelRowHeight,
  },
  sheetContent: {
    flex: 1,
  },
  sheetViewport: {
    overflow: 'hidden',
  },
  // Matches `rounded-t-3xl`'s --cs-radius-3xl (22px) — GlassView doesn't take
  // className, so the radius is set directly to keep the same silhouette as
  // the non-glass fallback.
  surfaceGlass: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
});
