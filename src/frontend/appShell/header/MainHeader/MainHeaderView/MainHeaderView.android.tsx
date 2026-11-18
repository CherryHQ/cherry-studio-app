import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { HeaderActionGroup } from '../../components/HeaderActionGroup/HeaderActionGroup';
import { mainHeaderRowHeight } from '../../headerScreenOptions';
import { MainHeaderAgentLabel, MainHeaderAgentSwitch } from '../MainHeaderAgentLabel';
import { useMainHeaderActions } from '../useMainHeaderActions';
import type { MainHeaderViewProps } from './MainHeaderView.types';

const HEADER_HORIZONTAL_INSET = 16;
const HEADER_BLUR_INTENSITY = 24;

/** Route options for a screen that hosts this header: the overlay replaces the native toolbar. */
export const mainHeaderScreenOptions = { headerShown: false } as const;

export function MainHeaderView({
  agent,
  onAgentPress,
  onAgentSwitch,
  onNewChat,
  blurTarget,
  hidden,
  actions,
  selection,
}: MainHeaderViewProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const { leadingAction, rightActions } = useMainHeaderActions(onNewChat, actions);
  const horizontalInset = HEADER_HORIZONTAL_INSET + Math.max(insets.left, insets.right);

  if (hidden) return null;

  return (
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
        {/* The chat route is a drawer root, so the route policy resolves this
            leading action to the sidebar button, or to none when the file pane or a fold
            holds the column. */}
        <View className="shrink-0 items-start">
          <HeaderActionGroup
            actions={
              selection
                ? [
                    {
                      key: 'exit-selection',
                      type: 'icon',
                      accessibilityLabel: t('common.cancel'),
                      icon: ArrowLeftIcon,
                      onPress: selection.onExit,
                    },
                  ]
                : leadingAction
                  ? [leadingAction]
                  : []
            }
            placement="left"
          />
        </View>
        <View className="min-w-0 flex-1 flex-row items-center gap-2" pointerEvents="box-none">
          {selection ? (
            <Text className="w-full text-center font-semibold text-base text-foreground">
              {t('common.selection.count', { count: selection.selectedCount })}
            </Text>
          ) : agent ? (
            <View className="relative min-w-0 shrink rounded-full">
              {/* The header already blurs the chat underneath. Keep this tint
                  translucent so the capsule shares that blur without another pass. */}
              <View className="absolute inset-0 rounded-full bg-card/70" pointerEvents="none" />
              <MainHeaderAgentLabel agent={agent} onPress={onAgentPress} />
            </View>
          ) : null}
          {!selection && agent && onAgentSwitch ? (
            <View className="shrink-0 rounded-full bg-card/70">
              <MainHeaderAgentSwitch onPress={onAgentSwitch} />
            </View>
          ) : null}
        </View>
        <View className="shrink-0 items-end">
          {selection ? (
            <View className="w-12" />
          ) : (
            <HeaderActionGroup actions={rightActions} placement="right" />
          )}
        </View>
      </View>
    </View>
  );
}
