import { BottomSheet } from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useModelPickerData } from '../hooks/useModelPickerData';
import { type ModelPickerModelItem, type ModelPickerTag } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import { ModelPickerList } from './ModelPickerList';

const initialModelPickerListItemCount = 24;
const modelPickerListItemBatchSize = 24;
const defaultSelectedTags: readonly ModelPickerTag[] = [];
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
  providerId?: string;
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
  providerId,
  selectedTags = defaultSelectedTags,
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
  const { groups, isLoading, pinnedModelIds } = useModelPickerData({
    providerId,
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
    <BottomSheet open={isOpen ?? true}>
      <BottomSheet.Content height={sheetHeight} onClose={handleClose} testID="model-picker">
        <BottomSheet.Header>
          <BottomSheet.CloseButton accessibilityLabel={t('common.close')} />
          <BottomSheet.Title>{title ?? t('modelPicker.title')}</BottomSheet.Title>
          <BottomSheet.HeaderSpacer />
        </BottomSheet.Header>
        <BottomSheet.SearchField
          accessibilityLabel={t('navigation.search')}
          clearAccessibilityLabel={t('common.clear')}
          onChangeText={handleSearchTextChange}
          onClear={() => handleSearchTextChange('')}
          placeholder={t('navigation.search')}
          value={searchText}
        />
        {/* The card's fixed height + this flex body bound the list, so
            LegendList virtualizes without any manual height math. */}
        <BottomSheet.Body>
          <View style={styles.modelListViewport}>
            <ModelPickerList
              emptyText={t('settings.provider.models.search.empty')}
              hasMoreItems={hasMoreListItems}
              isLoading={isLoading}
              isOpen={isOpen ?? true}
              listItems={listItems}
              loadingText={t('settings.provider.models.loading')}
              onEndReached={handleListEndReached}
              onSelect={onSelect}
              pinnedModelIds={pinnedModelIds}
              selectedModelId={selectedModelId}
            />
          </View>
        </BottomSheet.Body>
        {footer ? <BottomSheet.Footer>{footer}</BottomSheet.Footer> : null}
      </BottomSheet.Content>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  modelListViewport: {
    flex: 1,
    minHeight: 0,
  },
});
