import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BackHeader } from '@/components/headers';
import {
  buildModelPickerListItems,
  getNextModelSelection,
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  type ModelPickerModelItem,
  ModelPickerSheetContent,
  type ModelSettingKind,
  useModelPickerData,
  useModelSettingSelections,
} from '@/components/modelPicker';
import { SelectionSheetSearchField } from '@/components/selectionSheet';
import { isLiquidGlassAvailable } from '@/config/constants';

const initialModelPickerListItemCount = 12;
const modelPickerListItemBatchSize = 24;

function isModelSettingKind(value: string): value is ModelSettingKind {
  return MODEL_SETTING_KINDS.includes(value as ModelSettingKind);
}

export default function ModelSelectionScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const modelSettingKind = kind && isModelSettingKind(kind) ? kind : undefined;

  if (!modelSettingKind) {
    return <Redirect href="/settings/model" />;
  }

  return <ModelSelectionContent kind={modelSettingKind} />;
}

function ModelSelectionContent({ kind }: { kind: ModelSettingKind }) {
  const { t } = useTranslation();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const modelSettings = useModelSettingSelections();
  const topInset = isLiquidGlassAvailable ? headerHeight : 0;
  const [searchText, setSearchText] = useState('');
  const [visibleListItemCount, setVisibleListItemCount] = useState(initialModelPickerListItemCount);
  const { groups, isLoading, pinnedModelIds } = useModelPickerData({ searchText });
  const isSearching = searchText.trim().length > 0;
  const totalListItemCount = useMemo(
    () => groups.reduce((total, group) => total + 1 + group.items.length, 0),
    [groups],
  );
  const listItems = useMemo(
    () => buildModelPickerListItems(groups, visibleListItemCount),
    [groups, visibleListItemCount],
  );
  const hasMoreListItems = listItems.length < totalListItemCount;

  const handleSearchTextChange = useCallback((nextSearchText: string) => {
    setSearchText(nextSearchText);
    setVisibleListItemCount(initialModelPickerListItemCount);
  }, []);
  const handleListEndReached = useCallback(() => {
    setVisibleListItemCount((currentCount) => {
      if (currentCount >= totalListItemCount) {
        return currentCount;
      }

      return Math.min(currentCount + modelPickerListItemBatchSize, totalListItemCount);
    });
  }, [totalListItemCount]);
  const handleModelPress = useCallback(
    (item: ModelPickerModelItem) => {
      const nextModelId = getNextModelSelection(modelSettings.selections[kind], item.modelId);

      modelSettings.onSelectionChange(kind, nextModelId);
      router.back();
    },
    [kind, modelSettings, router],
  );

  return (
    <>
      <BackHeader title={t(MODEL_SETTING_KIND_TITLE_KEYS[kind])} />
      <View className="flex-1" style={{ paddingTop: topInset }}>
        <View className="px-4 pt-5 pb-1">
          <SelectionSheetSearchField onChange={handleSearchTextChange} value={searchText} />
        </View>
        <View className="min-h-0 flex-1">
          <ModelPickerSheetContent
            emptyText={t('settings.provider.models.search.empty')}
            hasMoreItems={hasMoreListItems}
            isLoading={isLoading}
            isSearching={isSearching}
            listItems={listItems}
            loadingText={t('settings.provider.models.loading')}
            pinnedModelIds={pinnedModelIds}
            selectedModelId={modelSettings.selections[kind]}
            onEndReached={handleListEndReached}
            onSelect={handleModelPress}
          />
        </View>
      </View>
    </>
  );
}
