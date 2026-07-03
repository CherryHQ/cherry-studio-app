import { cn } from 'heroui-native/utils';
import { BrainIcon, CheckIcon, ChevronRightIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

export type ModelPickerReasoningOption = {
  labelKey: string;
  value: string;
};

// Reasoning is a chat-only concern, injected by the caller so the model picker
// stays generic (the settings screen simply omits it). The picker never reaches
// into the chat-input context.
export type ModelPickerReasoningConfig = {
  onChange: (value: string) => void;
  options: readonly ModelPickerReasoningOption[];
  value: string;
};

// Row shown under the filter bar on the main screen; tapping it pushes the
// reasoning sub-page onto the native stack.
export function ModelPickerReasoningRow({
  onPress,
  options,
  value,
}: {
  onPress: () => void;
  options: readonly ModelPickerReasoningOption[];
  value: string;
}) {
  const { t } = useTranslation();
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Pressable
      accessibilityRole="button"
      className="mt-3 min-h-12 flex-row items-center gap-2 active:opacity-70"
      onPress={onPress}
    >
      <BrainIcon className="size-6 text-foreground" />
      <Text className="flex-1 text-base text-foreground">{t('chat.reasoning.title')}</Text>
      <View className="flex-row items-center gap-1">
        <Text className="text-default-foreground text-base" numberOfLines={1}>
          {selectedOption ? t(selectedOption.labelKey) : null}
        </Text>
        <ChevronRightIcon className="size-5 text-default-foreground" strokeWidth={2} />
      </View>
    </Pressable>
  );
}

// The pushed sub-page: the reasoning-effort option list. The native stack header
// supplies the title + back button, so this renders only the options.
export function ModelPickerReasoningPage({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: readonly ModelPickerReasoningOption[];
  value: string;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-1 px-4 pt-2">
      {options.map((option) => {
        const label = t(option.labelKey);
        const isSelected = option.value === value;

        return (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="min-h-14 flex-row items-center gap-4 rounded-2xl px-3 py-2 active:bg-surface-secondary active:opacity-70"
            key={option.value}
            onPress={() => onChange(option.value)}
          >
            <Text
              className={cn('flex-1 text-base', isSelected ? 'text-accent' : 'text-foreground')}
              numberOfLines={1}
            >
              {label}
            </Text>
            {isSelected ? <CheckIcon className="size-5 text-accent" strokeWidth={2.25} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
