import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { MainHeaderAgentButton } from './MainHeaderAgentButton';
import { useMainHeaderActions } from './useMainHeaderActions';
import { useMainHeaderAgentPicker } from './useMainHeaderAgentPicker';

export function MainHeader() {
  const insets = useSafeAreaInsets();
  const { agent, currentAgentId, leadingAction, rightActions } = useMainHeaderActions();
  const { agentPickerSheet, openAgentPicker } = useMainHeaderAgentPicker(currentAgentId);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="bg-background">
        <View style={{ height: insets.top }} />
        {/* 56dp row matches the native-stack toolbar height, so the 40dp action
            surfaces keep the same clearance as native-header screens. */}
        <View className="h-14 flex-row items-center px-4">
          {/* The chat route is currently a drawer root, so the route policy
              resolves this leading action to the sidebar button. */}
          <View className="flex-1 items-start">
            <HeaderActionGroup actions={[leadingAction]} placement="left" />
          </View>
          <View className="flex-1 items-center">
            {agent ? <MainHeaderAgentButton agent={agent} onPress={openAgentPicker} /> : null}
          </View>
          <View className="flex-1 items-end">
            <HeaderActionGroup actions={rightActions} placement="right" />
          </View>
        </View>
      </View>
      {agentPickerSheet}
    </>
  );
}
