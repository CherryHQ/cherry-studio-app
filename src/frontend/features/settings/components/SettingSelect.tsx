import type { ImageSource } from 'expo-image';
import { Select } from 'heroui-native';
import { ChevronsUpDownIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Image } from '@/frontend/components/nativePrimitives';

const selectTriggerWidth = 128;
const selectContentWidth = 256;

export type SettingSelectOption<TValue extends string> = {
  imageSource?: ImageSource | number;
  label: string;
  value: TValue;
};

type SettingSelectProps<TValue extends string> = {
  label: string;
  options: SettingSelectOption<TValue>[];
  value?: TValue | null;
} & (
  | {
      isClearable: true;
      onValueChange: (value: TValue | null) => void;
    }
  | {
      isClearable?: false;
      onValueChange: (value: TValue) => void;
    }
);

export function SettingSelect<TValue extends string>(props: SettingSelectProps<TValue>) {
  const { label, options, value } = props;
  const clearableSelection = props.isClearable === true ? props : null;
  const requiredSelection = props.isClearable === true ? null : props;
  const isClearable = props.isClearable === true;
  const onClearableValueChange = clearableSelection?.onValueChange;
  const onRequiredValueChange = requiredSelection?.onValueChange;
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
        if (isClearable) {
          onClearableValueChange?.(matchedOption.value === value ? null : matchedOption.value);
          return;
        }

        onRequiredValueChange?.(matchedOption.value);
      }
    },
    [isClearable, onClearableValueChange, onRequiredValueChange, options, value],
  );

  return (
    <Select value={selectedOption} onValueChange={handleValueChange}>
      <Select.Trigger
        accessibilityLabel={label}
        className="flex-row items-center justify-end gap-1 rounded-xl bg-transparent px-0 py-0 shadow-none"
        style={{ width: selectTriggerWidth }}
      >
        <View className="flex-1 flex-row items-center justify-end gap-2">
          {selectedOption?.imageSource ? (
            <Image
              cachePolicy="memory-disk"
              className="size-[18px]"
              contentFit="contain"
              recyclingKey={selectedOption.value}
              source={selectedOption.imageSource}
            />
          ) : null}
          <Text className="text-right text-base text-default-foreground" numberOfLines={1}>
            {selectedOption?.label ?? t('settings.select.placeholder')}
          </Text>
        </View>
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
              <View className="flex-1 flex-row items-center gap-3">
                {option.imageSource ? (
                  <Image
                    cachePolicy="memory-disk"
                    className="size-[22px]"
                    contentFit="contain"
                    recyclingKey={option.value}
                    source={option.imageSource}
                  />
                ) : null}
                <Select.ItemLabel className="flex-1" numberOfLines={1} />
              </View>
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
