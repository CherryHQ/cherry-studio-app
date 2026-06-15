import {
  BottomSheet,
  type BottomSheetMethods,
  BottomSheetView,
} from '@expo/ui/community/bottom-sheet';
import { SearchField } from 'heroui-native/search-field';
import { XIcon } from 'lucide-uniwind/png';
import { type Ref, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenStack, ScreenStackHeaderLeftView, ScreenStackItem } from 'react-native-screens';
import { useModelPickerData } from '../hooks/useModelPickerData';
import { type ModelPickerModelItem, type ModelPickerTag } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import { ModelPickerFilterTagBar } from './ModelPickerFilterTagBar';
import {
  type ModelPickerReasoningConfig,
  ModelPickerReasoningPage,
  ModelPickerReasoningRow,
} from './ModelPickerReasoningPage';
import { ModelPickerSheetContent } from './ModelPickerSheetContent';

const modelPickerSnapPoints = ['85%', '100%'];
// Keep aligned with modelPickerSnapPoints: the active snap point's fraction
// drives the inner viewport height so it fills the sheet at every snap point.
const modelPickerSnapPointFractions = [0.85, 1];
const defaultModelPickerSnapIndex = 0;
const initialModelPickerListItemCount = 12;
const modelPickerListItemBatchSize = 24;

type ModelPickerScreen = 'main' | 'reasoning';

type ModelPickerBottomSheetProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  // Chat-only: when provided, a "reasoning effort" row is shown under the filter
  // bar that pushes a sub-page. The settings screen omits this.
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
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedTags, setSelectedTags] = useState<ModelPickerTag[]>([]);
  const [visibleListItemCount, setVisibleListItemCount] = useState(initialModelPickerListItemCount);
  const [activeSnapIndex, setActiveSnapIndex] = useState(defaultModelPickerSnapIndex);
  // The stack is the source of truth for what's mounted; pushing 'reasoning'
  // appends a ScreenStackItem and the native side plays the transition.
  const [stack, setStack] = useState<ModelPickerScreen[]>(['main']);
  const isSearching = searchText.trim().length > 0;
  const snapPointFraction =
    modelPickerSnapPointFractions[activeSnapIndex] ??
    modelPickerSnapPointFractions[defaultModelPickerSnapIndex];
  // The native stack needs a concrete frame; derive it from the active snap point
  // (model picker uses fixed snapPoints, not dynamic content sizing).
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * snapPointFraction;
  const { availableTags, groups, isLoading, isPinActionDisabled, pinnedModelIds, togglePin } =
    useModelPickerData({ searchText, selectedTags });
  const totalListItemCount = useMemo(
    () => groups.reduce((total, group) => total + 1 + group.items.length, 0),
    [groups],
  );
  const listItems = useMemo(
    () => buildModelPickerListItems(groups, visibleListItemCount),
    [groups, visibleListItemCount],
  );
  const hasMoreListItems = listItems.length < totalListItemCount;
  const sheetIndex = isOpen === undefined ? -1 : isOpen ? 0 : -1;

  const popReasoning = useCallback(() => {
    setStack((prev) => prev.filter((screen) => screen !== 'reasoning'));
  }, []);
  const pushReasoning = useCallback(() => {
    setStack((prev) => (prev.includes('reasoning') ? prev : [...prev, 'reasoning']));
  }, []);
  const handleReasoningChange = useCallback(
    (value: string) => {
      reasoning?.onChange(value);
      popReasoning();
    },
    [popReasoning, reasoning],
  );

  const handleClosePress = useCallback(() => {
    sheetRef.current?.close();
  }, []);
  const handleSelect = useCallback(
    (item: ModelPickerModelItem) => {
      onSelect(item);
      sheetRef.current?.close();
    },
    [onSelect],
  );
  const handleTogglePin = useCallback(
    (modelId: ModelPickerModelItem['modelId']) => togglePin(modelId),
    [togglePin],
  );
  const handleSearchTextChange = useCallback((nextSearchText: string) => {
    setSearchText(nextSearchText);
    setVisibleListItemCount(initialModelPickerListItemCount);
  }, []);
  const handleToggleTag = useCallback((tag: ModelPickerTag) => {
    setVisibleListItemCount(initialModelPickerListItemCount);
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((selectedTag) => selectedTag !== tag)
        : [...current, tag],
    );
  }, []);
  const handleClose = useCallback(() => {
    setSearchText('');
    setSelectedTags([]);
    setVisibleListItemCount(initialModelPickerListItemCount);
    setActiveSnapIndex(defaultModelPickerSnapIndex);
    setStack(['main']);
    onClose?.();
  }, [onClose]);
  const handleSnapChange = useCallback((index: number) => {
    if (index < 0) {
      return;
    }

    setActiveSnapIndex(index);
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
      dismiss: () => sheetRef.current?.dismiss(),
      present: () => sheetRef.current?.present(),
    }),
    [],
  );

  return (
    <BottomSheet
      enablePanDownToClose
      enableDynamicSizing={false}
      handleComponent={null}
      index={sheetIndex}
      ref={sheetRef}
      snapPoints={modelPickerSnapPoints}
      onChange={handleSnapChange}
      onClose={handleClose}
    >
      <BottomSheetView style={styles.sheetContent}>
        <View style={[styles.sheetViewport, { height: sheetHeight }]}>
          <ScreenStack style={styles.stack}>
            <ScreenStackItem
              contentStyle={styles.screen}
              headerConfig={{
                backgroundColor: 'transparent',
                hideShadow: true,
                title: t('chat.model.select'),
                // Close button, matching the add sheet: native SF Symbol on iOS,
                // a cross-platform header subview on Android.
                ...(Platform.OS === 'ios'
                  ? {
                      headerLeftBarButtonItems: [
                        {
                          accessibilityLabel: t('common.close'),
                          icon: { name: 'xmark', type: 'sfSymbol' },
                          onPress: handleClosePress,
                          type: 'button',
                        },
                      ],
                    }
                  : {
                      children: (
                        <ScreenStackHeaderLeftView>
                          <Pressable
                            accessibilityLabel={t('common.close')}
                            accessibilityRole="button"
                            className="size-8 items-center justify-center rounded-full active:opacity-70"
                            hitSlop={6}
                            onPress={handleClosePress}
                          >
                            <XIcon className="size-6 text-foreground" strokeWidth={2} />
                          </Pressable>
                        </ScreenStackHeaderLeftView>
                      ),
                    }),
              }}
              screenId="main"
              stackAnimation="default"
            >
              <View style={styles.mainScreen}>
                <View className="px-4 pt-3">
                  <SearchField
                    className="w-full"
                    onChange={handleSearchTextChange}
                    value={searchText}
                  >
                    <SearchField.Group className="h-10 rounded-xl bg-settings-grouped-surface">
                      <SearchField.SearchIcon iconProps={{ size: 18 }} />
                      <SearchField.Input
                        accessibilityLabel={t('navigation.search')}
                        autoCapitalize="none"
                        autoComplete="off"
                        autoCorrect={false}
                        className="h-10 min-h-10 rounded-xl border-0 bg-transparent py-0 pl-9 pr-10 text-base leading-5"
                        placeholder={t('navigation.search')}
                        returnKeyType="search"
                        spellCheck={false}
                        style={styles.searchInput}
                        textContentType="none"
                      />
                      <SearchField.ClearButton
                        accessibilityLabel={t('common.clear')}
                        className="right-1"
                      />
                    </SearchField.Group>
                  </SearchField>
                  <ModelPickerFilterTagBar
                    availableTags={availableTags}
                    selectedTags={selectedTags}
                    onToggleTag={handleToggleTag}
                  />
                  {reasoning ? (
                    <ModelPickerReasoningRow
                      onPress={pushReasoning}
                      options={reasoning.options}
                      value={reasoning.value}
                    />
                  ) : null}
                </View>
                <View style={styles.modelListViewport}>
                  <ModelPickerSheetContent
                    emptyText={t('settings.provider.models.search.empty')}
                    isLoading={isLoading}
                    isPinActionDisabled={isPinActionDisabled}
                    isSearching={isSearching}
                    hasMoreItems={hasMoreListItems}
                    listItems={listItems}
                    loadingText={t('settings.provider.models.loading')}
                    pinnedModelIds={pinnedModelIds}
                    selectedModelId={selectedModelId}
                    onEndReached={handleListEndReached}
                    onSelect={handleSelect}
                    onTogglePin={handleTogglePin}
                  />
                </View>
              </View>
            </ScreenStackItem>

            {reasoning && stack.includes('reasoning') ? (
              <ScreenStackItem
                contentStyle={styles.screen}
                headerConfig={{
                  backButtonDisplayMode: 'minimal',
                  backgroundColor: 'transparent',
                  hideShadow: true,
                  title: t('chat.reasoning.title'),
                }}
                onDismissed={popReasoning}
                screenId="reasoning"
                stackAnimation="default"
              >
                <ModelPickerReasoningPage
                  onChange={handleReasoningChange}
                  options={reasoning.options}
                  value={reasoning.value}
                />
              </ScreenStackItem>
            ) : null}
          </ScreenStack>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  mainScreen: {
    flex: 1,
  },
  modelListViewport: {
    flex: 1,
    minHeight: 0,
  },
  // Transparent so the sheet's own material shows through instead of each screen
  // painting its own systemBackground on top of it.
  screen: {
    backgroundColor: 'transparent',
  },
  searchInput: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  sheetContent: {
    flex: 1,
  },
  sheetViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  stack: {
    flex: 1,
  },
});
