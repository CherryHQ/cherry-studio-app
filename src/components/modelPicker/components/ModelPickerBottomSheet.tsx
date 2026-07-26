import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/bottomSheet';
import { SelectionSheetSearchField } from '@/components/selectionSheet';

import { useModelPickerData } from '../hooks/useModelPickerData';
import { type ModelPickerModelItem, type ModelPickerTag } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import { ModelPickerSheetContent } from './ModelPickerSheetContent';

const initialModelPickerListItemCount = 24;
const modelPickerListItemBatchSize = 24;
// Fraction of the available height the picker fills, giving the list room to scroll.
const modelPickerSnapPointFraction = 0.85;

type ModelPickerBottomSheetProps = {
  /**
   * Pinned below the model list at the bottom of the sheet (e.g. the
   * reasoning-effort slider). The slot owns its divider/padding so an empty
   * render leaves no stray chrome behind.
   */
  footer?: ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  selectedTags?: readonly ModelPickerTag[];
  selectedModelId: string | null;
  showPinnedModels?: boolean;
  // Header title; defaults to the generic "Select model". Pass a context-specific
  // title (e.g. the model-setting kind) when the picker isn't the chat default.
  title?: string;
};

export function ModelPickerBottomSheet({
  footer,
  isOpen,
  onClose,
  onSelect,
  selectedTags = [],
  selectedModelId,
  showPinnedModels = true,
  title,
}: ModelPickerBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * modelPickerSnapPointFraction;
  const [searchText, setSearchText] = useState('');
  const [visibleListItemCount, setVisibleListItemCount] = useState(initialModelPickerListItemCount);
  const isSearching = searchText.trim().length > 0;
  const { groups, isLoading, pinnedModelIds } = useModelPickerData({
    searchText,
    selectedTags,
    showPinnedModels,
  });
  const totalListItemCount = useMemo(
    () => groups.reduce((total, group) => total + 1 + group.items.length, 0),
    [groups],
  );
  // Row index (including group-header rows) of the currently selected model in
  // the fully expanded list, so the sheet can scroll to it on open.
  const selectedModelListIndex = useMemo(() => {
    if (!selectedModelId) {
      return -1;
    }

    let index = 0;
    for (const group of groups) {
      index += 1; // group header occupies a row
      for (const model of group.items) {
        if (model.modelId === selectedModelId) {
          return index;
        }
        index += 1;
      }
    }

    return -1;
  }, [groups, selectedModelId]);
  // Ensure the selected model is materialized even when it sits past the lazy
  // window, plus a batch of trailing rows so the selected model can settle at
  // an upper-third position instead of being pinned to the very bottom.
  const listItemLimit =
    selectedModelListIndex >= 0
      ? Math.max(visibleListItemCount, selectedModelListIndex + 1 + modelPickerListItemBatchSize)
      : visibleListItemCount;
  const listItems = useMemo(
    () => buildModelPickerListItems(groups, listItemLimit),
    [groups, listItemLimit],
  );
  const hasMoreListItems = listItems.length < totalListItemCount;

  const handleSearchTextChange = useCallback((nextSearchText: string) => {
    setSearchText(nextSearchText);
    setVisibleListItemCount(initialModelPickerListItemCount);
  }, []);
  const handleClose = useCallback(() => {
    setSearchText('');
    setVisibleListItemCount(initialModelPickerListItemCount);
    onClose?.();
  }, [onClose]);
  const handleListEndReached = useCallback(() => {
    setVisibleListItemCount((currentCount) => {
      if (currentCount >= totalListItemCount) {
        return currentCount;
      }

      return Math.min(currentCount + modelPickerListItemBatchSize, totalListItemCount);
    });
  }, [totalListItemCount]);

  return (
    <BottomSheet
      closeAccessibilityLabel={t('common.close')}
      height={sheetHeight}
      isOpen={isOpen}
      onClose={handleClose}
      testID="model-picker"
      title={title ?? t('modelPicker.title')}
    >
      {/* The card's fixed height + this flex column bound the list, so
          LegendList (flex:1) virtualizes without any manual height math. */}
      <View style={styles.body}>
        <View className="px-4 pt-5">
          <SelectionSheetSearchField onChange={handleSearchTextChange} value={searchText} />
        </View>
        <View style={styles.modelListViewport}>
          <ModelPickerSheetContent
            emptyText={t('settings.provider.models.search.empty')}
            hasMoreItems={hasMoreListItems}
            isLoading={isLoading}
            isOpen={isOpen ?? true}
            isSearching={isSearching}
            listItems={listItems}
            loadingText={t('settings.provider.models.loading')}
            onEndReached={handleListEndReached}
            onSelect={onSelect}
            pinnedModelIds={pinnedModelIds}
            selectedModelId={selectedModelId}
          />
        </View>
        {footer ? <View>{footer}</View> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  modelListViewport: {
    flex: 1,
    minHeight: 0,
  },
});
