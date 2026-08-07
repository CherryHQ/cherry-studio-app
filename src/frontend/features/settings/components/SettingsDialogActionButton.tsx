import { Spinner } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { Pressable, Text, View } from 'react-native';

type SettingsDialogActionButtonProps = {
  isDisabled?: boolean;
  // Stretch the button to fill its row — used for the primary CTA in bottom sheets.
  isFullWidth?: boolean;
  isLoading?: boolean;
  isPrimary?: boolean;
  label: string;
  onPress: () => void;
};

export function SettingsDialogActionButton({
  isDisabled = false,
  isFullWidth = false,
  isLoading = false,
  isPrimary = false,
  label,
  onPress,
}: SettingsDialogActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      className={cn(
        'h-9 min-w-20 items-center justify-center rounded-xl px-4 active:opacity-80 disabled:opacity-40',
        isPrimary ? 'bg-primary' : 'bg-secondary',
        isFullWidth && 'w-full',
      )}
      disabled={isDisabled}
      onPress={onPress}
    >
      <View className="min-w-0 flex-row items-center justify-center gap-2 px-3">
        {isLoading ? <Spinner size="sm" /> : null}
        <Text
          className={
            isPrimary ? 'font-medium text-sm text-white' : 'font-medium text-foreground text-sm'
          }
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
