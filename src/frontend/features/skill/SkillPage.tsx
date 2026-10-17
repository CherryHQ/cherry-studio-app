import { useHeaderHeight } from 'expo-router/react-navigation';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type RouteHeaderProps } from '@/frontend/appShell/header';

export function SkillPage({
  children,
  footer,
  headerProps,
  testID,
}: {
  children: ReactNode;
  footer?: ReactNode;
  headerProps: RouteHeaderProps;
  testID?: string;
}) {
  const headerHeight = useHeaderHeight();
  const { bottom } = useSafeAreaInsets();

  return (
    <>
      <RouteHeader {...headerProps} />
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="flex-grow gap-6 px-6 py-6"
          contentContainerStyle={footer ? undefined : { paddingBottom: bottom + 24 }}
          contentInsetAdjustmentBehavior="never"
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
      </KeyboardAvoidingView>
    </>
  );
}
