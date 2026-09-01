import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { MainHeaderAgentButton } from './MainHeaderAgentButton';
import { useMainHeaderActions } from './useMainHeaderActions';
import { useMainHeaderAgentPicker } from './useMainHeaderAgentPicker';

const HEADER_HORIZONTAL_INSET = 16;
const HEADER_TITLE_ACTION_GAP = 4;

export function MainHeader() {
  const insets = useSafeAreaInsets();
  const { agent, currentAgentId, leadingAction, rightActions } = useMainHeaderActions();
  const { agentPickerSheet, openAgentPicker } = useMainHeaderAgentPicker(currentAgentId);
  const [leadingActionsWidth, setLeadingActionsWidth] = useState(0);
  const [rightActionsWidth, setRightActionsWidth] = useState(0);
  const titleSideInset =
    HEADER_HORIZONTAL_INSET +
    Math.max(leadingActionsWidth, rightActionsWidth) +
    HEADER_TITLE_ACTION_GAP;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="bg-background">
        <View style={{ height: insets.top }} />
        {/* 56dp row matches the native-stack toolbar height, so the 40dp action
            surfaces keep the same clearance as native-header screens. */}
        <View
          className="relative h-14 flex-row items-center"
          style={{ paddingHorizontal: HEADER_HORIZONTAL_INSET }}
        >
          {/* The chat route is currently a drawer root, so the route policy
              resolves this leading action to the sidebar button. */}
          <View
            className="z-10 items-start"
            onLayout={(event) => setLeadingActionsWidth(event.nativeEvent.layout.width)}
          >
            <HeaderActionGroup actions={[leadingAction]} placement="left" />
          </View>
          <View
            className="absolute inset-y-0 items-center justify-center"
            pointerEvents="box-none"
            style={{ left: titleSideInset, right: titleSideInset }}
          >
            {agent ? <MainHeaderAgentButton agent={agent} onPress={openAgentPicker} /> : null}
          </View>
          <View
            className="z-10 ml-auto items-end"
            onLayout={(event) => setRightActionsWidth(event.nativeEvent.layout.width)}
          >
            <HeaderActionGroup actions={rightActions} placement="right" />
          </View>
        </View>
      </View>
      {agentPickerSheet}
    </>
  );
}
