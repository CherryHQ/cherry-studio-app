import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { Stack } from 'expo-router';
import { type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { mainHeaderRowHeight } from '../headerScreenOptions';
import { MainHeaderAgentButton } from './MainHeaderAgentButton';
import { useMainHeaderActions } from './useMainHeaderActions';
import { useMainHeaderAgentPicker } from './useMainHeaderAgentPicker';

const HEADER_HORIZONTAL_INSET = 16;
const HEADER_BLUR_INTENSITY = 24;

export function MainHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const { agent, currentAgentId, leadingAction, rightActions } = useMainHeaderActions();
  const { agentPickerSheet, openAgentPicker } = useMainHeaderAgentPicker(currentAgentId);
  const horizontalInset = HEADER_HORIZONTAL_INSET + Math.max(insets.left, insets.right);

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
          className="flex-row items-center"
          pointerEvents="box-none"
          style={{ height: mainHeaderRowHeight, paddingHorizontal: horizontalInset }}
        >
          {/* The chat route is currently a drawer root, so the route policy
              resolves this leading action to the sidebar button. */}
          <View className="shrink-0 items-start">
            <HeaderActionGroup actions={[leadingAction]} placement="left" />
          </View>
          <View className="min-w-0 flex-1 items-start" pointerEvents="box-none">
            {agent ? (
              <View className="relative max-w-full min-w-0 rounded-full">
                {/* The header already blurs the chat underneath. Keep this tint
                    translucent so the capsule shares that blur without another pass. */}
                <View className="absolute inset-0 rounded-full bg-card/70" pointerEvents="none" />
                <MainHeaderAgentButton agent={agent} onPress={openAgentPicker} />
              </View>
            ) : null}
          </View>
          <View className="shrink-0 items-end">
            <HeaderActionGroup actions={rightActions} placement="right" />
          </View>
        </View>
      </View>
      {agentPickerSheet}
    </>
  );
}
