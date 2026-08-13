import {
  BottomSheet,
  type BottomSheetCloseReason,
  useBottomSheet,
} from '@cherrystudio/ui/components';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectionSheetSearchField } from '@/frontend/components/selectionSheet';

import { filterModelsByKeywords } from '../utils/providerModelSearch';
import { ProviderModelRow, providerModelRowEstimatedHeight } from './ProviderModelRow';

const providerModelSelectSheetHeightFraction = 0.85;
// Distinguishes a close that carries a choice from a dismissal, so the value
// lands after the sheet is gone rather than re-laying out the list on its way.
const selectionCloseReason = 'selection';

type ProviderModelSelectSheetExtraData = {
  onSelect: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedModelId: UniqueModelId | null;
};

/**
 * One of a provider's own models, drawn the way the provider's model tab draws
 * them. A generic label-and-tick option list stood here before, which made the
 * same models look like two different things two taps apart.
 */
export function ProviderModelSelectSheet({
  emptyText,
  isOpen,
  models,
  onClose,
  onSelect,
  provider,
  selectedModelId,
  title,
}: {
  emptyText: string;
  isOpen: boolean;
  models: readonly Model[];
  onClose: () => void;
  onSelect: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedModelId: UniqueModelId | null;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [searchText, setSearchText] = useState('');
  const pendingModelIdRef = useRef<UniqueModelId | null>(null);
  const sheetHeight =
    (windowHeight - insets.top - insets.bottom) * providerModelSelectSheetHeightFraction;
  const displayedModels = useMemo(
    () => filterModelsByKeywords(searchText, [...models]),
    [models, searchText],
  );

  const handleSheetClose = useCallback(
    (reason: BottomSheetCloseReason) => {
      const pendingModelId = pendingModelIdRef.current;
      pendingModelIdRef.current = null;
      setSearchText('');
      onClose();

      if (reason === selectionCloseReason && pendingModelId !== null) {
        onSelect(pendingModelId);
      }
    },
    [onClose, onSelect],
  );
  const handleSelect = useCallback((modelId: UniqueModelId) => {
    pendingModelIdRef.current = modelId;
  }, []);

  return (
    <BottomSheet
      closeAccessibilityLabel={title}
      height={sheetHeight}
      isOpen={isOpen}
      onClose={handleSheetClose}
      testID="provider-model-selection"
      title={title}
    >
      {/* The sheet's fixed height plus this column bound the list, so it
          virtualizes without any height math of its own. */}
      <View style={styles.body}>
        <View className="px-4 pt-2">
          <SelectionSheetSearchField onChange={setSearchText} value={searchText} />
        </View>
        <ProviderModelSelectList
          emptyText={emptyText}
          isOpen={isOpen}
          models={displayedModels}
          onSelect={handleSelect}
          provider={provider}
          selectedModelId={selectedModelId}
        />
      </View>
    </BottomSheet>
  );
}

function ProviderModelSelectList({
  emptyText,
  isOpen,
  models,
  onSelect,
  provider,
  selectedModelId,
}: {
  emptyText: string;
  isOpen: boolean;
  models: readonly Model[];
  onSelect: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedModelId: UniqueModelId | null;
}) {
  const listRef = useRef<LegendListRef>(null);
  const hasScrolledToSelectedRef = useRef(false);
  const selectedRowIndex = models.findIndex((model) => model.id === selectedModelId);
  // A provider can serve hundreds of models, so the one already chosen is
  // usually far below the fold — a highlight nobody scrolls to is no answer to
  // "which is set". Guarded on a ref so typing in the search box, which reorders
  // the list under it, doesn't yank the list back.
  useEffect(() => {
    if (!isOpen) {
      hasScrolledToSelectedRef.current = false;
      return;
    }

    if (hasScrolledToSelectedRef.current || selectedRowIndex < 0) {
      return;
    }

    hasScrolledToSelectedRef.current = true;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: selectedRowIndex,
        viewPosition: 0.35,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, selectedRowIndex]);
  const listExtraData = useMemo<ProviderModelSelectSheetExtraData>(
    () => ({ onSelect, provider, selectedModelId }),
    [onSelect, provider, selectedModelId],
  );
  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<Model>) => (
      <ProviderModelSelectRow
        isSelected={item.id === extraData.selectedModelId}
        model={item}
        provider={extraData.provider}
        onSelect={extraData.onSelect}
      />
    ),
    [],
  );
  const keyExtractor = useCallback((item: Model) => item.id, []);

  if (models.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-base text-foreground">{emptyText}</Text>
      </View>
    );
  }

  return (
    <LegendList
      ref={listRef}
      contentContainerStyle={styles.listContent}
      data={models}
      estimatedItemSize={providerModelRowEstimatedHeight}
      extraData={listExtraData}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={keyExtractor}
      maintainVisibleContentPosition={false}
      recycleItems
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
    />
  );
}

const ProviderModelSelectRow = memo(function ProviderModelSelectRow({
  isSelected,
  model,
  onSelect,
  provider,
}: {
  isSelected: boolean;
  model: Model;
  onSelect: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
}) {
  const { requestClose } = useBottomSheet();
  const handlePress = useCallback(() => {
    onSelect(model.id);
    requestClose(selectionCloseReason);
  }, [model.id, onSelect, requestClose]);

  return (
    <Pressable
      accessibilityLabel={model.name}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      className="active:opacity-60"
      onPress={handlePress}
    >
      {/* The fill is the whole mark of the selection, as in the model picker. */}
      <ProviderModelRow
        className={isSelected ? 'rounded-xl bg-secondary' : undefined}
        model={model}
        provider={provider}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  body: { flex: 1 },
  list: { flex: 1 },
  // 8 rather than the 16 the sheet's other chrome sits on: the rows carry their
  // own, which is what leaves the selected row's fill room outside its text.
  listContent: { paddingBottom: 20, paddingHorizontal: 8, paddingTop: 8 },
});
