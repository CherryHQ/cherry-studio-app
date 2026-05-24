import { Select } from 'heroui-native';
import { ChevronsUpDownIcon } from 'lucide-uniwind';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

const selectTriggerWidth = 128;
const selectContentWidth = 256;

export type SettingSelectOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type SettingSelectProps<TValue extends string> = {
  label: string;
  onValueChange: (value: TValue) => void;
  options: SettingSelectOption<TValue>[];
  value?: TValue | null;
};

export function SettingSelect<TValue extends string>({
  label,
  onValueChange,
  options,
  value,
}: SettingSelectProps<TValue>) {
  const { t } = useTranslation();
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const handleValueChange = useCallback(
    (nextOption?: { label: string; value: string }) => {
      if (!nextOption) {
        return;
      }

      const matchedOption = options.find((option) => option.value === nextOption.value);

      if (matchedOption) {
        onValueChange(matchedOption.value);
      }
    },
    [onValueChange, options],
  );

  return (
    <Select value={selectedOption} onValueChange={handleValueChange}>
      <Select.Trigger
        accessibilityLabel={label}
        className="flex-row items-center justify-end gap-1 rounded-xl bg-transparent px-0 py-0 shadow-none"
        style={{ width: selectTriggerWidth }}
      >
        <Text className="flex-1 text-right text-base text-default-foreground" numberOfLines={1}>
          {selectedOption?.label ?? t('settings.select.placeholder')}
        </Text>
        <View className="items-center justify-center">
          <ChevronsUpDownIcon className="size-4 text-default-foreground" strokeWidth={2} />
        </View>
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content
          align="end"
          className="p-2"
          presentation="popover"
          width={selectContentWidth}
        >
          {options.map((option) => (
            <Select.Item key={option.value} label={option.label} value={option.value}>
              <Select.ItemLabel className="flex-1" numberOfLines={1} />
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
