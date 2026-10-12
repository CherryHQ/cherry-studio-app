import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/** Grouped image actions; the owning screen supplies placement and safe-area insets. */
function ImagePreviewToolbarRoot({ children }: PropsWithChildren) {
  return (
    <View className="flex-row items-center justify-evenly gap-2 bg-background px-4 py-1">
      {children}
    </View>
  );
}

function ImagePreviewToolbarAction({
  disabled = false,
  emphasis = 'default',
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  emphasis?: 'default' | 'primary';
  icon?: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-2 px-1 active:opacity-70 disabled:opacity-40"
      disabled={disabled}
      onPress={onPress}
    >
      {icon}
      <Text
        className={
          emphasis === 'primary'
            ? 'shrink text-center text-xs font-medium text-primary'
            : 'shrink text-center text-xs text-foreground'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const ImagePreviewToolbar = Object.assign(ImagePreviewToolbarRoot, {
  Action: ImagePreviewToolbarAction,
});
