import { BottomSheet, type BottomSheetSize, Section } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

type SettingsOptionPickerOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type SettingsOptionPickerBottomSheetProps<TValue extends string> = {
  onClose: () => void;
  onSelect: (value: TValue) => void;
  open: boolean;
  options: readonly SettingsOptionPickerOption<TValue>[];
  renderLeading?: (option: SettingsOptionPickerOption<TValue>) => ReactNode;
  selectedValue: TValue;
  size: BottomSheetSize;
  testID?: string;
  title: string;
};

export function SettingsOptionPickerBottomSheet<TValue extends string>({
  onClose,
  onSelect,
  open,
  options,
  renderLeading,
  selectedValue,
  size,
  testID,
  title,
}: SettingsOptionPickerBottomSheetProps<TValue>) {
  return (
    <BottomSheet onClose={onClose} open={open} size={size} testID={testID} title={title}>
      <ScrollView contentContainerClassName="px-6 pt-2" showsVerticalScrollIndicator={false}>
        <Section>
          {options.map((option) => {
            const selected = option.value === selectedValue;

            return (
              <Section.RadioItem
                key={option.value}
                label={option.label}
                leading={renderLeading?.(option)}
                onPress={() => {
                  if (!selected) {
                    onSelect(option.value);
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
