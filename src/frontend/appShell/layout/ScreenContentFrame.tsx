import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Shared page constraints; neither frame owns navigation or page identity. */
export function FormContentFrame({ children }: PropsWithChildren) {
  return <ScreenContentFrame maxWidth={720}>{children}</ScreenContentFrame>;
}

export function ReadingContentFrame({ children }: PropsWithChildren) {
  return <ScreenContentFrame maxWidth={800}>{children}</ScreenContentFrame>;
}

function ScreenContentFrame({ children, maxWidth }: PropsWithChildren<{ maxWidth: number }>) {
  const { left, right } = useSafeAreaInsets();

  return (
    <View className="flex-1" style={{ paddingLeft: left, paddingRight: right }}>
      <View className="w-full flex-1 self-center" collapsable={false} style={{ maxWidth }}>
        {children}
      </View>
    </View>
  );
}
