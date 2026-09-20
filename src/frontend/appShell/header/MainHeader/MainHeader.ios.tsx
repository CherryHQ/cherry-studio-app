import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useIsPreview } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { HeaderAction } from '../components/HeaderAction';
import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { headerScreenOptions } from '../headerScreenOptions';
import { MainHeaderAgentButton } from './MainHeaderAgentButton';
import { useMainHeaderActions } from './useMainHeaderActions';
import { useMainHeaderAgentPicker } from './useMainHeaderAgentPicker';

const HEADER_BLUR_BAND_HEIGHT_RATIOS = [1, 0.72, 0.46, 0.22] as const;
// Several overlapping bands create the fade; a low per-band intensity avoids
// turning the top of the header into an opaque blur after the passes accumulate.
const HEADER_BLUR_INTENSITY = 9;
const legacyHeaderBackground = () => <LegacyHeaderBackground />;

export function MainHeader() {
  const isPreview = useIsPreview();
  const { agent, currentAgentId, leadingAction, rightActions } = useMainHeaderActions();
  const { agentPickerSheet, openAgentPicker } = useMainHeaderAgentPicker(currentAgentId);

  if (isPreview) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...headerScreenOptions,
          title: '',
          headerTransparent: true,
          headerBackground: isLiquidGlassAvailable ? undefined : legacyHeaderBackground,
          unstable_nativeProps: {
            headerConfig: {
              // Uniwind owns the window appearance. Native-stack's light/dark
              // override cannot update the visible iOS header dynamically.
              experimental_userInterfaceStyle: 'unspecified',
            },
          },
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View>
          <View className={isLiquidGlassAvailable ? undefined : 'rounded-full bg-card/70'}>
            <HeaderAction action={leadingAction} />
          </View>
        </Stack.Toolbar.View>
        <Stack.Toolbar.Spacer hidden={!agent} width={4} />
        {agent ? (
          <Stack.Toolbar.View>
            <View className={isLiquidGlassAvailable ? undefined : 'rounded-full bg-card/70'}>
              <MainHeaderAgentButton agent={agent} onPress={openAgentPicker} />
            </View>
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
      <HeaderActionGroup actions={rightActions} placement="right" />
      {agentPickerSheet}
    </>
  );
}

/**
 * Systems without the native toolbar's shared glass surface need this fallback.
 * Keep the native toolbar items, but paint a progressive blur behind them so
 * the header remains legible while the message list can still scroll beneath it.
 */
function LegacyHeaderBackground() {
  const { theme } = useUniwind();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {HEADER_BLUR_BAND_HEIGHT_RATIOS.map((ratio) => (
        <BlurView
          key={ratio}
          intensity={HEADER_BLUR_INTENSITY}
          tint={theme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
          style={{
            height: `${ratio * 100}%`,
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        />
      ))}
      <MaskedView
        maskElement={
          <LinearGradient
            colors={['black', 'black', 'transparent']}
            locations={[0, 0.62, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <View className="absolute inset-0 bg-card/70" />
      </MaskedView>
    </View>
  );
}
