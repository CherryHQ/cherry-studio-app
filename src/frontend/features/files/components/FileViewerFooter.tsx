import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The viewer's bottom action area. It owns the bottom safe area while shown. */
export function FileViewerFooter({ children }: PropsWithChildren) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View className="gap-3 bg-background px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
      {children}
    </View>
  );
}
