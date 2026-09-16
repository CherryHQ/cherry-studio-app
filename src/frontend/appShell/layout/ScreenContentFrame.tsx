import type { PropsWithChildren } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FORM_CONTENT_MAX_WIDTH = 720;

/** Whether the window leaves space beside the form column, inside its safe area. */
export function useIsFormContentConstrained() {
  const { width } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();

  return width - left - right > FORM_CONTENT_MAX_WIDTH;
}

/** Shared page constraints; neither frame owns navigation or page identity. */
export function FormContentFrame({ children }: PropsWithChildren) {
  return <ScreenContentFrame maxWidth={FORM_CONTENT_MAX_WIDTH}>{children}</ScreenContentFrame>;
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
