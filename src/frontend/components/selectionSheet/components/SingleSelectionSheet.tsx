import {
  BottomSheet,
  type BottomSheetCloseReason,
  useBottomSheet,
} from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { CheckIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectionSheetSearchField } from './SelectionSheetSearchField';

const estimatedOptionHeight = 48;
const searchableSheetHeightFraction = 0.85;
const compactSheetHeightFraction = 0.65;
const compactSheetChromeHeight = 76;
const selectionCloseReason = 'selection';

export type SingleSelectionSheetOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type SingleSelectionSheetProps<TValue extends string> = {
  closeAccessibilityLabel: string;
  emptyText: string;
  heightFraction?: number;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (value: TValue) => void;
  options: readonly SingleSelectionSheetOption<TValue>[];
  searchable?: boolean;
  selectedValue: TValue | null;
  testID: string;
  title: string;
};

export function SingleSelectionSheet<TValue extends string>({
  closeAccessibilityLabel,
  emptyText,
  heightFraction,
  isOpen,
  onClose,
  onSelect,
  options,
  searchable = false,
  selectedValue,
  testID,
  title,
}: SingleSelectionSheetProps<TValue>) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [searchText, setSearchText] = useState('');
  const pendingValueRef = useRef<TValue | null>(null);
  const availableHeight = windowHeight - insets.top - insets.bottom;
  const sheetHeight =
    heightFraction !== undefined
      ? availableHeight * heightFraction
      : searchable
        ? availableHeight * searchableSheetHeightFraction
        : Math.min(
            availableHeight * compactSheetHeightFraction,
            compactSheetChromeHeight + Math.max(1, options.length) * estimatedOptionHeight,
          );
  const normalizedSearchText = searchText.trim().toLocaleLowerCase();
  const visibleOptions = useMemo(
    () =>
      normalizedSearchText
        ? options.filter((option) =>
            option.label.toLocaleLowerCase().includes(normalizedSearchText),
          )
        : [...options],
    [normalizedSearchText, options],
  );

  const handleSheetClose = useCallback(
    (reason: BottomSheetCloseReason) => {
      const pendingValue = pendingValueRef.current;
      pendingValueRef.current = null;
      setSearchText('');
      onClose();

      if (reason === selectionCloseReason && pendingValue !== null) {
        onSelect(pendingValue);
      }
    },
    [onClose, onSelect],
  );
  const handleSelect = useCallback((value: TValue) => {
    pendingValueRef.current = value;
  }, []);

  return (
    <BottomSheet
      closeAccessibilityLabel={closeAccessibilityLabel}
      height={sheetHeight}
      isOpen={isOpen}
      onClose={handleSheetClose}
      testID={testID}
      title={title}
    >
      <View style={styles.body}>
        {searchable ? (
          <View className="px-4 pt-2">
            <SelectionSheetSearchField onChange={setSearchText} value={searchText} />
          </View>
        ) : null}
        <SelectionSheetOptions
          emptyText={emptyText}
          onSelect={handleSelect}
          options={visibleOptions}
          selectedValue={selectedValue}
        />
      </View>
    </BottomSheet>
  );
}

type SelectionSheetOptionsProps<TValue extends string> = {
  emptyText: string;
  onSelect: (value: TValue) => void;
  options: readonly SingleSelectionSheetOption<TValue>[];
  selectedValue: TValue | null;
};

function SelectionSheetOptions<TValue extends string>({
  emptyText,
  onSelect,
  options,
  selectedValue,
}: SelectionSheetOptionsProps<TValue>) {
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<SingleSelectionSheetOption<TValue>>) => (
      <SelectionSheetOptionRow
        isSelected={item.value === selectedValue}
        label={item.label}
        onSelect={onSelect}
        value={item.value}
      />
    ),
    [onSelect, selectedValue],
  );
  const keyExtractor = useCallback((item: SingleSelectionSheetOption<TValue>) => item.value, []);

  if (options.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-base text-foreground">{emptyText}</Text>
      </View>
    );
  }

  return (
    <LegendList
      contentContainerStyle={styles.listContent}
      data={options}
      estimatedItemSize={estimatedOptionHeight}
      keyExtractor={keyExtractor}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      recycleItems
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
    />
  );
}

function SelectionSheetOptionRow<TValue extends string>({
  isSelected,
  label,
  onSelect,
  value,
}: {
  isSelected: boolean;
  label: string;
  onSelect: (value: TValue) => void;
  value: TValue;
}) {
  const { requestClose } = useBottomSheet();
  const handlePress = () => {
    onSelect(value);
    requestClose(selectionCloseReason);
  };

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      className="min-h-12 flex-row items-center gap-3 px-1 py-2 active:opacity-60"
      onPress={handlePress}
    >
      <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={2}>
        {label}
      </Text>
      {isSelected ? <CheckIcon className="size-5 text-primary" strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: 20, paddingHorizontal: 16, paddingTop: 8 },
});
