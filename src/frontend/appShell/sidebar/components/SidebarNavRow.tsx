import type { LucideIconProps } from '@cherrystudio/app-icons';
import { cn } from '@cherrystudio/ui/utils';
import type { ComponentType } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

type SidebarNavRowProps = {
  icon: ComponentType<LucideIconProps>;
  label: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  /** The module currently open beside chat. */
  isSelected?: boolean;
};

// Gesture Handler's Pressable, not React Native's: these rows sit inside the
// drawer's pan gesture, and only the RNGH one negotiates with it instead of
// racing it.
//
// Uniwind does not resolve className or active: on RNGH Pressable. Keep the
// row's layout and pressed background on a native View using RNGH's press state.
export function SidebarNavRow({
  icon: Icon,
  label,
  onPress,
  testID,
  disabled,
  isSelected,
}: SidebarNavRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: isSelected }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      {({ pressed }) => (
        <View
          className={cn(
            'w-full flex-row items-center gap-4 rounded-xl px-5 py-2.5',
            isSelected && 'bg-secondary/70',
            pressed && 'bg-sidebar-accent',
          )}
        >
          <Icon className="size-[18px] text-sidebar-foreground" strokeWidth={1.6} />
          <Text className={cn('text-base text-sidebar-foreground', isSelected && 'font-medium')}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
