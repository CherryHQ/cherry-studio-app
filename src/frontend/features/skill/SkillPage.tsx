import { useHeaderHeight } from 'expo-router/react-navigation';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type RouteHeaderProps } from '@/frontend/appShell/header';
import { FormContentFrame } from '@/frontend/appShell/layout';

export function SkillPage({
  children,
  headerProps,
  testID,
}: {
  children: ReactNode;
  headerProps: RouteHeaderProps;
  testID?: string;
}) {
  const headerHeight = useHeaderHeight();
  const { bottom } = useSafeAreaInsets();

  return (
    <>
      <RouteHeader {...headerProps} />
      <FormContentFrame>
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={headerHeight}
          style={{ flex: 1 }}
        >
          <ScrollView
            className="flex-1 bg-background"
            contentContainerClassName="flex-grow gap-6 px-6 py-6"
            contentContainerStyle={{ paddingBottom: bottom + 24 }}
            contentInsetAdjustmentBehavior="never"
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            testID={testID}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </FormContentFrame>
    </>
  );
}
