import { CheckIcon } from 'lucide-uniwind';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { withUniwind } from 'uniwind';

import type { ModelSettingOption } from '../utils/modelSettings';

type ModelPickerSheetContentProps = {
  onSelect: (option: ModelSettingOption) => void;
  options: readonly ModelSettingOption[];
  selectedModelId: string | null;
};

const StyledPressable = withUniwind(Pressable);

export function ModelPickerSheetContent({
  onSelect,
  options,
  selectedModelId,
}: ModelPickerSheetContentProps) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View className="px-4 py-5">
        <View className="overflow-hidden rounded-2xl bg-surface-secondary">
          {options.map((option) => (
            <StyledPressable
              accessibilityLabel={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected: option.id === selectedModelId }}
              className="min-h-12 flex-row items-center justify-between gap-4 px-4 py-4 active:opacity-60"
              key={option.id}
              onPress={() => onSelect(option)}
            >
              <Text className="flex-1 text-base text-foreground" numberOfLines={1}>
                {option.label}
              </Text>
              {option.id === selectedModelId ? (
                <CheckIcon className="size-6 text-default-foreground" strokeWidth={2} />
              ) : null}
            </StyledPressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
