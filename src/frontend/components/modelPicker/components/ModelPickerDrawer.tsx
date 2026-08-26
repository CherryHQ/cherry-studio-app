import { BottomSheet, SearchField } from '@cherrystudio/ui/components';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useModelPickerData } from '../hooks/useModelPickerData';
import { type ModelPickerModelItem, type ModelPickerTag } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import { ModelPickerList } from './ModelPickerList';

const DEFAULT_SELECTED_TAGS: readonly ModelPickerTag[] = [];

type ModelPickerDrawerProps = {
  onClose: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  open: boolean;
  providerId?: string;
  selectedTags?: readonly ModelPickerTag[];
  selectedModelId: string | null;
  title?: string;
};

/** The complete model-picking interaction; callers only supply business state and actions. */
export function ModelPickerDrawer({
  onClose,
  onSelect,
  open,
  providerId,
  selectedTags = DEFAULT_SELECTED_TAGS,
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
        onSelect={onSelect}
        onSearchFocusChange={setIsSearchFocused}
        onSearchTextChange={setSearchText}
        open={open}
        providerId={providerId}
        searchText={searchText}
        selectedModelId={selectedModelId}
        selectedTags={selectedTags}
      />
    </BottomSheet>
  );
}

function ModelPickerDrawerContent({
  deferredSearchText,
  onSelect,
  onSearchFocusChange,
  onSearchTextChange,
  open,
  providerId,
  searchText,
  selectedTags,
  selectedModelId,
}: Pick<
  ModelPickerDrawerProps,
  'onSelect' | 'open' | 'providerId' | 'selectedModelId' | 'selectedTags'
> & {
  deferredSearchText: string;
  onSearchFocusChange: (isFocused: boolean) => void;
  onSearchTextChange: (value: string) => void;
  searchText: string;
}) {
  const { t } = useTranslation();
  const { groups, isLoading } = useModelPickerData({
    providerId,
    searchText: deferredSearchText,
    selectedTags,
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
