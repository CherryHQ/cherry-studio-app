import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

/** Optional actions below an image; the owning screen supplies actions and safe-area insets. */
function ImagePreviewToolbarRoot({ children }: PropsWithChildren) {
  return (
    <View className="bg-constant-black">
      <ScrollView
        horizontal
        contentContainerClassName="grow items-center justify-evenly gap-4 px-4 py-3"
        showsHorizontalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function ImagePreviewToolbarAction({
  disabled = false,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-11 min-w-11 items-center justify-center gap-1 px-3 py-2 active:opacity-70 disabled:opacity-40"
      disabled={disabled}
      onPress={onPress}
    >
      {icon}
      <Text className="text-center text-sm text-constant-white">{label}</Text>
    </Pressable>
  );
}

export const ImagePreviewToolbar = Object.assign(ImagePreviewToolbarRoot, {
  Action: ImagePreviewToolbarAction,
});
