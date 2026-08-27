import { BottomSheet, SearchField } from '@cherrystudio/ui/components';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useModelPickerData } from '../hooks/useModelPickerData';
import type { ModelPickerModelItem } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import type { ModelTypeFilter } from '../utils/modelTypeFilter';
import { ModelPickerList } from './ModelPickerList';

type ModelPickerDrawerProps = {
  modelType: ModelTypeFilter;
  onClose: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  open: boolean;
  providerId?: string;
  selectedModelId: string | null;
  title?: string;
};

/** The complete model-picking interaction; callers only supply business state and actions. */
export function ModelPickerDrawer({
  modelType,
  onClose,
  onSelect,
  open,
  providerId,
  selectedModelId,
  title,
}: ModelPickerDrawerProps) {
  const { t } = useTranslation();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const isSearchExpanded = isSearchFocused || searchText.trim().length > 0;

  return (
    <BottomSheet
      onClose={onClose}
      open={open}
      size={isSearchExpanded ? 'full' : 'large'}
      testID="model-picker"
      title={title ?? t('modelPicker.title')}
    >
      <ModelPickerDrawerContent
        deferredSearchText={deferredSearchText}
        modelType={modelType}
        onSelect={onSelect}
        onSearchFocusChange={setIsSearchFocused}
        onSearchTextChange={setSearchText}
        open={open}
        providerId={providerId}
        searchText={searchText}
        selectedModelId={selectedModelId}
      />
    </BottomSheet>
  );
}

function ModelPickerDrawerContent({
  deferredSearchText,
  modelType,
  onSelect,
  onSearchFocusChange,
  onSearchTextChange,
  open,
  providerId,
  searchText,
  selectedModelId,
}: Pick<
  ModelPickerDrawerProps,
  'modelType' | 'onSelect' | 'open' | 'providerId' | 'selectedModelId'
> & {
  deferredSearchText: string;
  onSearchFocusChange: (isFocused: boolean) => void;
  onSearchTextChange: (value: string) => void;
  searchText: string;
}) {
  const { t } = useTranslation();
  const { groups, isLoading } = useModelPickerData({
    modelType,
    providerId,
    searchText: deferredSearchText,
  });
  const listItems = useMemo(() => buildModelPickerListItems(groups), [groups]);

  return (
    <View className="min-h-0 flex-1">
      <View className="px-5 pb-2">
        <SearchField
          accessibilityLabel={t('modelPicker.searchPlaceholder')}
          clearAccessibilityLabel={t('common.clear')}
          onBlur={() => onSearchFocusChange(false)}
          onChangeText={onSearchTextChange}
          onClear={() => onSearchTextChange('')}
          onFocus={() => onSearchFocusChange(true)}
          placeholder={t('modelPicker.searchPlaceholder')}
          testID="model-picker-search"
          value={searchText}
        />
      </View>
      <View className="min-h-0 flex-1">
        <ModelPickerList
          emptyText={t('settings.provider.models.search.empty')}
          isLoading={isLoading}
          isOpen={open}
          listItems={listItems}
          loadingText={t('settings.provider.models.loading')}
          onSelect={onSelect}
          selectedModelId={selectedModelId}
        />
      </View>
    </View>
  );
}
