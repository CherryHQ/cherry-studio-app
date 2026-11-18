import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useIsPreview } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useReportChatHeaderHeight } from '@/frontend/appShell/layout';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { renderHeaderToolbarItem } from '../../components/HeaderAction';
import { headerScreenOptions } from '../../headerScreenOptions';
import { MainHeaderAgentLabel, MainHeaderAgentSwitch } from '../MainHeaderAgentLabel';
import { useMainHeaderActions } from '../useMainHeaderActions';
import type { MainHeaderViewProps } from './MainHeaderView.types';

const HEADER_BLUR_BAND_HEIGHT_RATIOS = [1, 0.72, 0.46, 0.22] as const;
// Several overlapping bands create the fade; a low per-band intensity avoids
// turning the top of the header into an opaque blur after the passes accumulate.
const HEADER_BLUR_INTENSITY = 9;
const legacyHeaderBackground = () => <LegacyHeaderBackground />;

/**
 * Route options for a screen that hosts this header, declared with the route so the first frame
 * already has the transparent native toolbar. The view itself only toggles `hidden`, which cannot
 * move content because the toolbar never takes layout space.
 */
export const mainHeaderScreenOptions = {
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
} as const;

export function MainHeaderView({
  agent,
  hidden,
  onAgentPress,
  onAgentSwitch,
  onNewChat,
  actions,
  selection,
}: MainHeaderViewProps) {
  const { t } = useTranslation();
  const isPreview = useIsPreview();
  const { leadingAction, rightActions } = useMainHeaderActions(onNewChat, actions);
  const { width } = useWindowDimensions();
  const agentWidth = Math.max(
    40,
    width - 40 - (leadingAction ? 44 : 0) - rightActions.length * 44 - (onAgentSwitch ? 48 : 0),
  );
  useReportChatHeaderHeight();
  if (isPreview) {
    return null;
  }

  if (hidden) return <Stack.Screen options={{ headerShown: false }} />;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: selection ? t('common.selection.count', { count: selection.selectedCount }) : '',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Toolbar placement="left">
        {selection
          ? renderHeaderToolbarItem(
              {
                key: 'exit-selection',
                type: 'icon',
                accessibilityLabel: t('common.cancel'),
                icon: ArrowLeftIcon,
                nativeIcon: require('@/assets/header-toolbar/arrow-left.png'),
                onPress: selection.onExit,
              },
              actionSurface,
            )
          : leadingAction
            ? renderHeaderToolbarItem(leadingAction, actionSurface)
            : null}
        <Stack.Toolbar.Spacer hidden={Boolean(selection) || !leadingAction || !agent} width={4} />
        {!selection && agent ? (
          <Stack.Toolbar.View>
            <View className={actionSurface.surfaceClassName} style={{ maxWidth: agentWidth }}>
              <MainHeaderAgentLabel agent={agent} onPress={onAgentPress} />
            </View>
          </Stack.Toolbar.View>
        ) : null}
        <Stack.Toolbar.Spacer hidden={Boolean(selection) || !agent || !onAgentSwitch} width={8} />
        {!selection && agent && onAgentSwitch ? (
          <Stack.Toolbar.View>
            <View className={actionSurface.surfaceClassName}>
              <MainHeaderAgentSwitch onPress={onAgentSwitch} />
            </View>
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        {selection
          ? null
          : rightActions.map((action) => renderHeaderToolbarItem(action, actionSurface))}
      </Stack.Toolbar>
    </>
  );
}

const actionSurface = {
  surfaceClassName: isLiquidGlassAvailable ? undefined : 'rounded-full bg-card/70',
};

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
