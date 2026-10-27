import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useIsPreview } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useReportChatHeaderHeight } from '@/frontend/appShell/layout';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { HeaderAction, type HeaderToolbarAction } from '../../components/HeaderAction';
import { headerScreenOptions } from '../../headerScreenOptions';
import { MainHeaderAgentLabel } from '../MainHeaderAgentLabel';
import { useMainHeaderActions } from '../useMainHeaderActions';
import type { MainHeaderViewProps } from './MainHeaderView.types';

const HEADER_BLUR_BAND_HEIGHT_RATIOS = [1, 0.72, 0.46, 0.22] as const;
// Several overlapping bands create the fade; a low per-band intensity avoids
// turning the top of the header into an opaque blur after the passes accumulate.
const HEADER_BLUR_INTENSITY = 9;
const legacyHeaderBackground = () => <LegacyHeaderBackground />;

export function MainHeaderView({
  agent,
  hidden,
  onAgentPress,
  onNewChat,
  actions,
}: MainHeaderViewProps) {
  const isPreview = useIsPreview();
  const { leadingAction, rightActions } = useMainHeaderActions(onNewChat, actions);
  useReportChatHeaderHeight();
  if (isPreview) {
    return null;
  }

  if (hidden) return <Stack.Screen options={{ ...headerScreenOptions, headerShown: false }} />;

  return (
    <>
      <Stack.Screen
        options={{
          ...headerScreenOptions,
          headerShown: true,
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
        {/* A permanent sidebar has no button that opens it. */}
        {leadingAction ? renderToolbarItem(leadingAction) : null}
        <Stack.Toolbar.Spacer hidden={!leadingAction || !agent} width={4} />
        {agent ? (
          <Stack.Toolbar.View>
            <View className={isLiquidGlassAvailable ? undefined : 'rounded-full bg-card/70'}>
              <MainHeaderAgentLabel agent={agent} onPress={onAgentPress} />
            </View>
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
      {rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">{rightActions.map(renderToolbarItem)}</Stack.Toolbar>
      ) : null}
    </>
  );
}

/**
 * An action with a native icon becomes a standard toolbar button, which iOS can place where the
 * window puts its controls, such as an iPhone Duo's vertical rail. Without the shared glass surface
 * (before iOS 26) every action keeps its custom view and fallback surface. A plain function, not a
 * component: Expo reads the toolbar's direct children before rendering them.
 */
function renderToolbarItem(action: HeaderToolbarAction) {
  if (isLiquidGlassAvailable && action.type === 'icon' && action.nativeIcon) {
    return (
      <Stack.Toolbar.Button
        key={action.key}
        accessibilityLabel={action.accessibilityLabel}
        disabled={action.disabled}
        icon={action.nativeIcon}
        iconRenderingMode="template"
        onPress={action.onPress}
      />
    );
  }

  return (
    <Stack.Toolbar.View key={action.key}>
      <View className={isLiquidGlassAvailable ? undefined : 'rounded-full bg-card/70'}>
        <HeaderAction action={action} />
      </View>
    </Stack.Toolbar.View>
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
