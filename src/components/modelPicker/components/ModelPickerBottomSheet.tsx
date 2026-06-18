import type { BottomSheetMethods } from '@expo/ui/community/bottom-sheet';
import { ChevronLeftIcon } from 'lucide-uniwind/png';
import { type Ref, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SelectionBottomSheet, SelectionSheetSearchField } from '@/components/selectionSheet';
import { useModelPickerData } from '../hooks/useModelPickerData';
import { type ModelPickerModelItem } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import {
  type ModelPickerReasoningConfig,
  ModelPickerReasoningPage,
  ModelPickerReasoningRow,
} from './ModelPickerReasoningPage';
import { ModelPickerSheetContent } from './ModelPickerSheetContent';

const defaultModelPickerHeaderHeight = 96;
const initialModelPickerListItemCount = 12;
const modelPickerListItemBatchSize = 24;

type ModelPickerScreen = 'main' | 'reasoning';

type ModelPickerBottomSheetProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  // Chat-only: when provided, a "reasoning effort" row is shown under the search
  // field that swaps the sheet to a reasoning sub-screen. The settings screen omits it.
  reasoning?: ModelPickerReasoningConfig;
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
  reasoning,
  ref,
  selectedModelId,
}: ModelPickerBottomSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [searchText, setSearchText] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);
  // Local screen swap stands in for a native stack: nesting a ScreenStack inside
  // the bottom sheet crashes on present, so reasoning is a plain conditional view.
  const [screen, setScreen] = useState<ModelPickerScreen>('main');
  const [visibleListItemCount, setVisibleListItemCount] = useState(initialModelPickerListItemCount);
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
      sheetRef.current?.close();
    },
    [onSelect],
  );
  const handleSearchTextChange = useCallback((nextSearchText: string) => {
    setSearchText(nextSearchText);
    setVisibleListItemCount(initialModelPickerListItemCount);
  }, []);
  const handleClose = useCallback(() => {
    setSearchText('');
    setScreen('main');
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
  const openReasoning = useCallback(() => setScreen('reasoning'), []);
  const closeReasoning = useCallback(() => setScreen('main'), []);
  const handleReasoningChange = useCallback(
    (value: string) => {
      reasoning?.onChange(value);
      setScreen('main');
    },
    [reasoning],
  );

  useImperativeHandle(
    ref,
    () => ({
      dismiss: () => sheetRef.current?.dismiss(),
      present: () => sheetRef.current?.present(),
    }),
    [],
  );

  return (
    <SelectionBottomSheet bottomSheetRef={sheetRef} isOpen={isOpen} onClose={handleClose}>
      {({ sheetHeight }) => {
        if (reasoning && screen === 'reasoning') {
          return (
            <>
              <View className="flex-row items-center gap-1 px-2 pt-3 pb-1">
                <Pressable
                  accessibilityLabel={t('navigation.back')}
                  accessibilityRole="button"
                  className="size-9 items-center justify-center rounded-full active:opacity-70"
                  hitSlop={6}
                  onPress={closeReasoning}
                >
                  <ChevronLeftIcon className="size-6 text-foreground" strokeWidth={2} />
                </Pressable>
                <Text className="font-semibold text-foreground text-lg">
                  {t('chat.reasoning.title')}
                </Text>
              </View>
              <ModelPickerReasoningPage
                onChange={handleReasoningChange}
                options={reasoning.options}
                value={reasoning.value}
              />
            </>
          );
        }

        const modelListHeight = Math.max(
          sheetHeight - (headerHeight || defaultModelPickerHeaderHeight),
          120,
        );

        return (
          <>
            <View className="px-4 pt-5" onLayout={handleHeaderLayout}>
              <SelectionSheetSearchField onChange={handleSearchTextChange} value={searchText} />
              {reasoning ? (
                <ModelPickerReasoningRow
                  onPress={openReasoning}
                  options={reasoning.options}
                  value={reasoning.value}
                />
              ) : null}
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
    flex: 1,
    minHeight: 0,
  },
});
