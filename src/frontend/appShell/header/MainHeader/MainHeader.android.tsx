import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { Stack } from 'expo-router';
import { type RefObject, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { mainHeaderRowHeight } from '../headerScreenOptions';
import { MainHeaderAgentButton } from './MainHeaderAgentButton';
import { useMainHeaderActions } from './useMainHeaderActions';
import { useMainHeaderAgentPicker } from './useMainHeaderAgentPicker';

const HEADER_HORIZONTAL_INSET = 16;
const HEADER_TITLE_ACTION_GAP = 4;
const HEADER_BLUR_INTENSITY = 24;

export function MainHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
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
      <View className="absolute inset-x-0 top-0 z-20" pointerEvents="box-none">
        <MaskedView
          maskElement={
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  experimental_backgroundImage:
                    'linear-gradient(to bottom, black 0%, black 62%, transparent 100%)',
                },
              ]}
            />
          }
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <BlurView
            blurMethod="dimezisBlurViewSdk31Plus"
            blurReductionFactor={2}
            blurTarget={blurTarget}
            intensity={HEADER_BLUR_INTENSITY}
            style={StyleSheet.absoluteFill}
            tint={theme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
          />
        </MaskedView>
        <View pointerEvents="none" style={{ height: insets.top }} />
        {/* 56dp row matches the native-stack toolbar height, so the 36dp action
            surfaces keep the same clearance as native-header screens. */}
        <View
          className="relative flex-row items-center"
          pointerEvents="box-none"
          style={{ height: mainHeaderRowHeight, paddingHorizontal: HEADER_HORIZONTAL_INSET }}
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
