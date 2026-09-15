import { useHeaderHeight } from 'expo-router/react-navigation';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Plugin pages keep their primary action below the scrolling content and above the keyboard. */
export function PluginPage({
  children,
  footer,
  testID,
}: {
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}) {
  const headerHeight = useHeaderHeight();
  const { bottom } = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1 }}
    >
      <View className="flex-1 bg-background">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-8 px-6 py-6"
          contentContainerStyle={footer ? undefined : { paddingBottom: bottom + 24 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          testID={testID}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            className="gap-3 border-t border-border-subtle bg-background px-6 pt-4"
            style={{ paddingBottom: Math.max(bottom, 16) }}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
