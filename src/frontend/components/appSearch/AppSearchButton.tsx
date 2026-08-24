import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { Pressable } from 'react-native';

export function AppSearchButton({
  accessibilityLabel,
  disabled = false,
  onPress,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="size-10 shrink-0 items-center justify-center rounded-full bg-secondary active:opacity-60 disabled:opacity-50"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
    >
      <SearchIcon className="size-5 text-foreground" />
    </Pressable>
  );
}
