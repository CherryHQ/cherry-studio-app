import { CheckIcon } from '@cherrystudio/app-icons';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetBody, BottomSheetContent, BottomSheetRoot } from './bottom-sheet';
import {
  BottomSheetCloseButton,
  BottomSheetHeader,
  BottomSheetHeaderSpacer,
  BottomSheetTitle,
} from './bottom-sheet-header';
import { useBottomSheet } from './bottom-sheet.context';
import type {
  BottomSheetCloseReason,
  BottomSheetSelectionOption,
  BottomSheetSelectionProps,
} from './bottom-sheet.types';

const ESTIMATED_OPTION_HEIGHT = 48;
const DEFAULT_HEIGHT_FRACTION = 0.65;
const COMPACT_CHROME_HEIGHT = 76;
const SELECTION_CLOSE_REASON = 'selection';

export function BottomSheetSelection<TValue extends string>({
  closeAccessibilityLabel,
  defaultOpen,
  emptyText,
  heightFraction,
  onClose,
  onOpenChange,
  onSelect,
  open,
  options,
  selectedValue,
  testID,
  title,
}: BottomSheetSelectionProps<TValue>) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const pendingValueRef = useRef<TValue | null>(null);
  const availableHeight = windowHeight - insets.top - insets.bottom;
  const sheetHeight =
    heightFraction !== undefined
      ? availableHeight * heightFraction
      : Math.min(
          availableHeight * DEFAULT_HEIGHT_FRACTION,
          COMPACT_CHROME_HEIGHT + Math.max(1, options.length) * ESTIMATED_OPTION_HEIGHT,
        );
  const handleClose = useCallback(
    (reason: BottomSheetCloseReason) => {
      const pendingValue = pendingValueRef.current;
      pendingValueRef.current = null;
      onClose();

      if (reason === SELECTION_CLOSE_REASON && pendingValue !== null) {
        onSelect(pendingValue);
      }
    },
    [onClose, onSelect],
  );
  const handleSelect = useCallback((value: TValue) => {
    pendingValueRef.current = value;
  }, []);

  return (
    <BottomSheetRoot defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      <BottomSheetContent height={sheetHeight} onClose={handleClose} testID={testID}>
        <BottomSheetHeader>
          <BottomSheetCloseButton accessibilityLabel={closeAccessibilityLabel} />
          <BottomSheetTitle>{title}</BottomSheetTitle>
          <BottomSheetHeaderSpacer />
        </BottomSheetHeader>
        <BottomSheetBody>
          <SelectionOptions
            emptyText={emptyText}
            onSelect={handleSelect}
            options={options}
            selectedValue={selectedValue}
          />
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

function SelectionOptions<TValue extends string>({
  emptyText,
  onSelect,
  options,
  selectedValue,
}: {
  emptyText: string;
  onSelect: (value: TValue) => void;
  options: readonly BottomSheetSelectionOption<TValue>[];
  selectedValue: TValue | null;
}) {
  const data = useMemo(() => [...options], [options]);
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<BottomSheetSelectionOption<TValue>>) => (
      <SelectionOptionRow
        isSelected={item.value === selectedValue}
        label={item.label}
        onSelect={onSelect}
        value={item.value}
      />
    ),
    [onSelect, selectedValue],
  );
  const keyExtractor = useCallback((item: BottomSheetSelectionOption<TValue>) => item.value, []);

  if (data.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-base text-foreground">{emptyText}</Text>
      </View>
    );
  }

  return (
    <LegendList
      contentContainerStyle={styles.listContent}
      data={data}
      estimatedItemSize={ESTIMATED_OPTION_HEIGHT}
      extraData={selectedValue}
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

function SelectionOptionRow<TValue extends string>({
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

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      className="min-h-12 flex-row items-center gap-3 px-1 py-2 active:opacity-60"
      onPress={() => {
        onSelect(value);
        requestClose(SELECTION_CLOSE_REASON);
      }}
    >
      <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={2}>
        {label}
      </Text>
      {isSelected ? <CheckIcon className="size-5 text-foreground" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: 20, paddingHorizontal: 16, paddingTop: 8 },
});
