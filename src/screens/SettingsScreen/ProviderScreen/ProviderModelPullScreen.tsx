import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from 'heroui-native/button';
import { Checkbox } from 'heroui-native/checkbox';
import { Spinner } from 'heroui-native/spinner';
import { cn } from 'heroui-native/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/components/headers';
import { ModelPickerIcon, type ModelPickerModelItem } from '@/components/modelPicker';
import { ModelPickerTagChip } from '@/components/modelPicker/components/ModelPickerTagChip';
import {
  getModelPickerTags,
  type ModelPickerTag,
} from '@/components/modelPicker/utils/modelPickerData';
import type { Model, UniqueModelId } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { useProviderDetailSettings } from './detail';
import { useProviderModelPull } from './models';
import {
  buildProviderModelPullApplyPayload,
  createDefaultProviderModelPullSelection,
  type ProviderModelPullPreview,
  type ProviderModelPullSelection,
} from './models/utils/providerModelPullPreview';

type ProviderModelPullSelectionOverride = ProviderModelPullSelection & {
  previewKey: string;
};

export default function ProviderModelPullScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string; providerName?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const loadStartedRef = useRef(false);
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const { applyPullPreview, isApplying, isPreviewLoading, loadPullPreview, preview } =
    useProviderModelPull({
      provider,
      providerId: providerId ?? '',
    });

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
        router.back();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadPullPreview, provider, providerId, router]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={t('settings.provider.models.pullPreviewTitle')} />
      {preview ? (
        <ProviderModelPullPreviewPage
          isApplying={isApplying}
          preview={preview}
          provider={provider}
          onApply={async (payload) => {
            const didApply = await applyPullPreview(payload);
            if (didApply) {
              router.back();
            }
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 px-4">
          <Spinner />
          <Text className="text-base text-default-foreground">
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
  isApplying,
  onApply,
  preview,
  provider,
}: {
  isApplying: boolean;
  onApply: (
    payload: NonNullable<ReturnType<typeof buildProviderModelPullApplyPayload>>,
  ) => Promise<void> | void;
  preview: ProviderModelPullPreview;
  provider: Provider | undefined;
}) {
  const { t } = useTranslation();
  const [selectionOverride, setSelectionOverride] =
    useState<ProviderModelPullSelectionOverride | null>(null);
  const previewKey = useMemo(() => getPreviewKey(preview), [preview]);
  const defaultSelection = useMemo(
    () => createDefaultProviderModelPullSelection(preview),
    [preview],
  );
  const selection =
    selectionOverride?.previewKey === previewKey ? selectionOverride : defaultSelection;
  const selectedAddedIds = selection.addedIds;
  const selectedMissingIds = selection.missingIds;
  const addedCount = preview.added.length;
  const missingCount = preview.missing.length;
  const selectedTotal = selectedAddedIds.size + selectedMissingIds.size;
  const totalRows = addedCount + missingCount;
  const isAllSelected = selectedTotal === totalRows && totalRows > 0;
  const allAddedSelected = addedCount > 0 && selectedAddedIds.size === addedCount;
  const allMissingSelected = missingCount > 0 && selectedMissingIds.size === missingCount;
  const applyLabel = isAllSelected
    ? t('settings.provider.models.pullApplyAll')
    : t('settings.provider.models.pullApplySelected');

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
    setSelectionOverride({
      addedIds: allAddedSelected ? new Set() : new Set(preview.added.map((model) => model.id)),
      missingIds: selectedMissingIds,
      previewKey,
    });
  }, [allAddedSelected, preview.added, previewKey, selectedMissingIds]);
  const toggleAllMissing = useCallback(() => {
    setSelectionOverride({
      addedIds: selectedAddedIds,
      missingIds: allMissingSelected
        ? new Set()
        : new Set(preview.missing.map((model) => model.id)),
      previewKey,
    });
  }, [allMissingSelected, preview.missing, previewKey, selectedAddedIds]);
  const handleApply = useCallback(() => {
    const payload = buildProviderModelPullApplyPayload(preview, {
      addedIds: selectedAddedIds,
      missingIds: selectedMissingIds,
    });
    if (!payload) {
      return;
    }

    void onApply(payload);
  }, [onApply, preview, selectedAddedIds, selectedMissingIds]);

  return (
    <View className="flex-1">
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {preview.added.length ? (
          <PullSection
            actionLabel={t(
              allAddedSelected
                ? 'settings.provider.models.pullDeselectAll'
                : 'settings.provider.models.pullSelectAll',
            )}
            count={preview.added.length}
            isDisabled={isApplying}
            isMissing={false}
            models={preview.added}
            provider={provider}
            selectedIds={selectedAddedIds}
            title={t('settings.provider.models.pullAddedSection')}
            onActionPress={toggleAllAdded}
            onToggleModel={toggleAddedSelection}
          />
        ) : null}

        {preview.missing.length ? (
          <PullSection
            actionLabel={t(
              allMissingSelected
                ? 'settings.provider.models.pullDeselectAll'
                : 'settings.provider.models.pullSelectAll',
            )}
            count={preview.missing.length}
            isDisabled={isApplying}
            isMissing
            models={preview.missing}
            provider={provider}
            selectedIds={selectedMissingIds}
            title={t('settings.provider.models.pullMissingSection')}
            onActionPress={toggleAllMissing}
            onToggleModel={toggleMissingSelection}
          />
        ) : null}
      </ScrollView>

      <View className="border-border border-t px-4 py-3">
        <Button
          className="h-10 min-h-0 rounded-xl"
          isDisabled={isApplying || selectedTotal === 0}
          variant="primary"
          onPress={handleApply}
        >
          <View className="min-w-0 flex-row items-center justify-center gap-2">
            {isApplying ? <Spinner size="sm" /> : null}
            <Text className="font-medium text-sm text-white" numberOfLines={1}>
              {applyLabel}
            </Text>
          </View>
        </Button>
      </View>
    </View>
  );
}

function PullSection({
  actionLabel,
  count,
  isDisabled,
  isMissing,
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
  isMissing: boolean;
  models: Model[];
  onActionPress: () => void;
  onToggleModel: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedIds: Set<UniqueModelId>;
  title: string;
}) {
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
      <View className="overflow-hidden rounded-xl bg-settings-grouped-surface">
        {models.map((model) => (
          <PullModelRow
            key={model.id}
            isDisabled={isDisabled}
            isMissing={isMissing}
            isSelected={selectedIds.has(model.id)}
            model={model}
            provider={provider}
            onToggleModel={onToggleModel}
          />
        ))}
      </View>
    </View>
  );
}

function PullModelRow({
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
      className="flex-row items-center gap-3 bg-transparent px-3 py-2 active:opacity-60 disabled:opacity-40"
      disabled={isDisabled}
      onPress={handleToggle}
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
}

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

function getPreviewKey(preview: ProviderModelPullPreview): string {
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

const styles = StyleSheet.create({
  scrollContent: {
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
});
