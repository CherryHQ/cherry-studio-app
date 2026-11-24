import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The viewer's bottom action area. It owns the bottom safe area while shown. */
export function FileViewerFooter({ children }: PropsWithChildren) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View className="bg-background px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
      <View className="mx-auto w-full max-w-[720px] gap-3">{children}</View>
    </View>
  );
}
