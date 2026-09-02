import type { LucideIconProps } from '@cherrystudio/app-icons';
import type { ComponentType } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

type SidebarNavRowProps = {
  icon: ComponentType<LucideIconProps>;
  label: string;
  onPress: () => void;
};

// Gesture Handler's Pressable, not React Native's: these rows sit inside the
// drawer's pan gesture, and only the RNGH one negotiates with it instead of
// racing it.
//
// The press state is an `active:` class rather than a function `style`, because
// a function style replaces whatever the className resolved to — which silently
// drops the row's own layout.
export function SidebarNavRow({ icon: Icon, label, onPress }: SidebarNavRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className="w-full active:bg-sidebar-accent"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-4 px-5 py-3">
        <Icon className="size-6 text-sidebar-foreground" />
        <Text className="text-base text-sidebar-foreground">{label}</Text>
      </View>
    </Pressable>
  );
}
