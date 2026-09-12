import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { BottomSheet, type BottomSheetSize } from '../bottom-sheet';
import { Section } from '../section';

export type OptionPickerValue = number | string;

export type OptionPickerOption<TValue extends OptionPickerValue> = {
  accessibilityLabel?: string;
  description?: ReactNode;
  label: ReactNode;
  leading?: ReactNode;
  value: TValue;
};

export type OptionPickerBottomSheetProps<TValue extends OptionPickerValue> = {
  helperText?: ReactNode;
  onClose: () => void;
  onValueChange: (value: TValue) => void;
  open: boolean;
  options: readonly OptionPickerOption<TValue>[];
  selectedValue: TValue;
  size: BottomSheetSize;
  testID?: string;
  title: string;
};

/**
 * A controlled single-choice sheet. The caller owns its value and visibility;
 * the sheet owns option semantics, selection feedback, and close timing.
 */
export function OptionPickerBottomSheet<TValue extends OptionPickerValue>({
  helperText,
  onClose,
  onValueChange,
  open,
  options,
  selectedValue,
  size,
  testID,
  title,
}: OptionPickerBottomSheetProps<TValue>) {
  return (
    <BottomSheet onClose={onClose} open={open} size={size} testID={testID} title={title}>
      <ScrollView contentContainerClassName="pt-2" showsVerticalScrollIndicator={false}>
        <Section footer={helperText} variant="plain">
          {options.map((option) => {
            const selected = option.value === selectedValue;

            return (
              <Section.RadioItem
                accessibilityLabel={option.accessibilityLabel}
                description={option.description}
                key={String(option.value)}
                label={option.label}
                leading={option.leading}
                onPress={() => {
                  if (!selected) {
                    onValueChange(option.value);
                  }

                  onClose();
                }}
                selected={selected}
              />
            );
          })}
        </Section>
      </ScrollView>
    </BottomSheet>
  );
}
