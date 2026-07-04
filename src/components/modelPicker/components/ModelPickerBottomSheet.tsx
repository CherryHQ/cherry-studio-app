import { type Ref, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { SelectionBottomSheet, SelectionSheetSearchField } from '@/components/selectionSheet';
import { useModelPickerData } from '../hooks/useModelPickerData';
import { type ModelPickerModelItem } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import { ModelPickerSheetContent } from './ModelPickerSheetContent';

const defaultModelPickerHeaderHeight = 64;
const initialModelPickerListItemCount = 12;
const modelPickerListItemBatchSize = 24;
// Detent indices for the underlying `SelectionBottomSheet`: 0 closed, 1 open.
const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;

type ModelPickerBottomSheetProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  ref?: Ref<ModelPickerBottomSheetHandle>;
  selectedModelId: string | null;
};

export type ModelPickerBottomSheetHandle = {
  dismiss: () => void;
  present: () => void;
};

export function ModelPickerBottomSheet({
  isOpen,
  onClose,
  onSelect,
  ref,
  selectedModelId,
}: ModelPickerBottomSheetProps) {
  const { t } = useTranslation();
  // `sheetIndex` is fed by two mutually-exclusive inputs, never both for the
  // same caller: declarative callers pass `isOpen`/`onClose` (adjusted during
  // render below); the imperative caller (chat input) never passes `isOpen`
  // and drives it purely through the `present`/`dismiss` ref handle.
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [searchText, setSearchText] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);
  const [visibleListItemCount, setVisibleListItemCount] = useState(initialModelPickerListItemCount);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setSheetIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  }
  const isSearching = searchText.trim().length > 0;
  const { groups, isLoading, pinnedModelIds } = useModelPickerData({ searchText });
  const totalListItemCount = useMemo(
    () => groups.reduce((total, group) => total + 1 + group.items.length, 0),
    [groups],
  );
  const listItems = useMemo(
    () => buildModelPickerListItems(groups, visibleListItemCount),
    [groups, visibleListItemCount],
  );
  const hasMoreListItems = listItems.length < totalListItemCount;

  const handleSelect = useCallback(
    (item: ModelPickerModelItem) => {
      onSelect(item);
      setSheetIndex(CLOSED_INDEX);
    },
    [onSelect],
  );
  const handleSearchTextChange = useCallback((nextSearchText: string) => {
    setSearchText(nextSearchText);
    setVisibleListItemCount(initialModelPickerListItemCount);
  }, []);
  const handleClose = useCallback(() => {
    setSearchText('');
    setVisibleListItemCount(initialModelPickerListItemCount);
    onClose?.();
  }, [onClose]);
  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setHeaderHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
  }, []);
  const handleListEndReached = useCallback(() => {
    setVisibleListItemCount((currentCount) => {
      if (currentCount >= totalListItemCount) {
        return currentCount;
      }

      return Math.min(currentCount + modelPickerListItemBatchSize, totalListItemCount);
    });
  }, [totalListItemCount]);

  useImperativeHandle(
    ref,
    () => ({
      dismiss: () => setSheetIndex(CLOSED_INDEX),
      present: () => setSheetIndex(OPEN_INDEX),
    }),
    [],
  );

  return (
    <SelectionBottomSheet
      index={sheetIndex}
      onIndexChange={setSheetIndex}
      onSettle={(nextIndex) => {
        if (nextIndex === CLOSED_INDEX) {
          handleClose();
        }
      }}
    >
      {({ sheetHeight }) => {
        const modelListHeight = Math.max(
          sheetHeight - (headerHeight || defaultModelPickerHeaderHeight),
          120,
        );

        return (
          <>
            <View className="px-4 pt-5" onLayout={handleHeaderLayout}>
              <SelectionSheetSearchField onChange={handleSearchTextChange} value={searchText} />
            </View>
            <View style={[styles.modelListViewport, { height: modelListHeight }]}>
              <ModelPickerSheetContent
                emptyText={t('settings.provider.models.search.empty')}
                isLoading={isLoading}
                isSearching={isSearching}
                hasMoreItems={hasMoreListItems}
                listItems={listItems}
                loadingText={t('settings.provider.models.loading')}
                pinnedModelIds={pinnedModelIds}
                selectedModelId={selectedModelId}
                onEndReached={handleListEndReached}
                onSelect={handleSelect}
              />
            </View>
          </>
        );
      }}
    </SelectionBottomSheet>
  );
}

const styles = StyleSheet.create({
  modelListViewport: {
    minHeight: 0,
  },
});
