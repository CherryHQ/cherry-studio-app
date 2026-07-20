import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { SelectionBottomSheet, SelectionSheetSearchField } from '@/components/selectionSheet';
import { useModelPickerData } from '../hooks/useModelPickerData';
import { type ModelPickerModelItem } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import { ModelPickerSheetContent } from './ModelPickerSheetContent';

const defaultModelPickerHeaderHeight = 64;
const initialModelPickerListItemCount = 24;
const modelPickerListItemBatchSize = 24;
// Detent indices for the underlying `SelectionBottomSheet`: 0 closed, 1 open.
const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;

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
  ref?: Ref<ModelPickerBottomSheetHandle>;
  selectedModelId: string | null;
};

export type ModelPickerBottomSheetHandle = {
  dismiss: () => void;
  present: () => void;
};

export function ModelPickerBottomSheet({
  footer,
  isOpen,
  onClose,
  onSelect,
  ref,
  selectedModelId,
}: ModelPickerBottomSheetProps) {
  const { t } = useTranslation();
  // `sheetIndex` is fed by two mutually-exclusive inputs, never both for the
  // same caller: declarative callers pass `isOpen`/`onClose`; the imperative
  // caller (chat input, now migrated to declarative) uses `present`/`dismiss`
  // via the ref handle below. On conditional mount `isOpen` is already `true`,
  // so a render-time comparison against `useState(isOpen)` misses the
  // transition — use `useEffect` instead.
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  useEffect(() => {
    if (isOpen !== undefined) {
      setSheetIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
    }
  }, [isOpen]);
  const [searchText, setSearchText] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [visibleListItemCount, setVisibleListItemCount] = useState(initialModelPickerListItemCount);
  const isSearching = searchText.trim().length > 0;
  const { groups, isLoading, pinnedModelIds } = useModelPickerData({ searchText });
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
  const handleFooterLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setFooterHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
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
        // footerHeight only grows from onLayout; drop it when the slot is empty so
        // a removed footer stops reserving its old band.
        const effectiveFooterHeight = footer ? footerHeight : 0;
        const modelListHeight = Math.max(
          sheetHeight - (headerHeight || defaultModelPickerHeaderHeight) - effectiveFooterHeight,
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
                isOpen={sheetIndex === OPEN_INDEX}
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
            {footer ? <View onLayout={handleFooterLayout}>{footer}</View> : null}
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
