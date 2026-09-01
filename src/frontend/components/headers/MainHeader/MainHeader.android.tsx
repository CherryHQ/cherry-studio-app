import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderActionGroup } from '../components/HeaderActionGroup';
import { useMainHeaderActions } from './useMainHeaderActions';

export function MainHeader() {
  const insets = useSafeAreaInsets();
  const { leadingAction, rightActions } = useMainHeaderActions();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="bg-background">
        <View style={{ height: insets.top }} />
        <View className="h-11 flex-row items-center justify-between px-4">
          {/* The chat route is currently a drawer root, so the route policy
              resolves this leading action to the sidebar button. */}
          <HeaderActionGroup actions={[leadingAction]} placement="left" />
          <HeaderActionGroup actions={rightActions} placement="right" />
        </View>
      </View>
    </>
  );
}
