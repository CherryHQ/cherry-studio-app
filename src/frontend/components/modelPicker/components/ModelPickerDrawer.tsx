import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { BottomSheet } from '@cherrystudio/ui/components';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

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

  return (
    <BottomSheet
      onClose={onClose}
      open={open}
      size="large"
      testID="model-picker"
      title={title ?? t('modelPicker.title')}
    >
      <ModelPickerDrawerContent
        onSelect={onSelect}
        open={open}
        providerId={providerId}
        selectedModelId={selectedModelId}
        selectedTags={selectedTags}
      />
    </BottomSheet>
  );
}

function ModelPickerDrawerContent({
  onSelect,
  open,
  providerId,
  selectedTags,
  selectedModelId,
}: Pick<
  ModelPickerDrawerProps,
  'onSelect' | 'open' | 'providerId' | 'selectedModelId' | 'selectedTags'
>) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const { groups, isLoading } = useModelPickerData({
    providerId,
    searchText: deferredSearchText,
    selectedTags,
  });
  const listItems = useMemo(() => buildModelPickerListItems(groups), [groups]);

  return (
    <View className="min-h-0 flex-1">
      <View className="px-5 pb-2">
        <View className="min-h-11 flex-row items-center gap-2 rounded-full bg-secondary px-3">
          <SearchIcon className="size-5 text-muted-foreground" />
          <TextInput
            accessibilityLabel={t('modelPicker.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-11 min-w-0 flex-1 py-0 text-base text-foreground"
            cursorColorClassName="accent-primary"
            onChangeText={setSearchText}
            placeholder={t('modelPicker.searchPlaceholder')}
            placeholderTextColorClassName="accent-muted-foreground"
            returnKeyType="search"
            selectionColorClassName="accent-primary"
            style={styles.searchInput}
            underlineColorAndroidClassName="accent-transparent"
            value={searchText}
          />
        </View>
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

const styles = StyleSheet.create({
  searchInput: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
