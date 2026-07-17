import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EffortSlider, thinkingAccentColor } from '@/components/effortSlider';
import {
  chatInputHorizontalScreenInset,
  getChatInputKeyboardStickyOffset,
} from '@/screens/ChatScreen/input/chatInputLayout';
import {
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import { useChatInputReasoningEfforts } from '@/screens/ChatScreen/input/hooks/useChatInputReasoningEfforts';
import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '@/screens/ChatScreen/input/utils/chatInputReasoning';

const panelGapAboveInput = 8;
const panelEntering = FadeIn.duration(120).reduceMotion(ReduceMotion.Never);
const panelExiting = FadeOut.duration(120).reduceMotion(ReduceMotion.Never);

type ChatInputReasoningPanelProps = {
  /** Measured floating-input height (incl. bottom padding) from workspace layout. */
  inputHeight: SharedValue<number>;
};

/**
 * Floating effort panel anchored above the chat input (the pill toggles it).
 * Mounts at the workspace level: the backdrop must cover the message list,
 * and the panel has to ride the same keyboard offset as the floating input —
 * neither works from inside the input's own (bounds-clipped) subtree.
 */
export function ChatInputReasoningPanel({ inputHeight }: ChatInputReasoningPanelProps) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation();
  const { isReasoningPanelOpen, reasoningEffort } = useChatInputState();
  const { closeReasoningPanel, selectReasoningEffort } = useChatInputActions();
  const reasoningEfforts = useChatInputReasoningEfforts();

  // The drawer's swipe area spans the whole screen (swipeEdgeWidth === width),
  // so a horizontal drag on the slider would otherwise open the sidebar.
  // Suspend the drawer's swipe while the panel is open (it's modal anyway —
  // the backdrop already blocks taps).
  useEffect(() => {
    const drawerNavigation = navigation.getParent();
    if (!drawerNavigation) {
      return;
    }
    drawerNavigation.setOptions({ swipeEnabled: !isReasoningPanelOpen });
    return () => drawerNavigation.setOptions({ swipeEnabled: true });
  }, [isReasoningPanelOpen, navigation]);

  // Keep reasoningEfforts' own order (off → default → minimal → … → max → auto),
  // low effort on the left. Filtering chatInputReasoningEffortOptions instead
  // would reorder them (that list is display-grouped, "default" first).
  const options = useMemo(
    () =>
      reasoningEfforts.map((value) => ({
        value,
        label: t(getChatInputReasoningEffortOption(value)?.labelKey ?? value),
      })),
    [reasoningEfforts, t],
  );

  const handleChange = useCallback(
    (value: string) => {
      selectReasoningEffort(value as ChatInputReasoningEffort);
    },
    [selectReasoningEffort],
  );

  const positionStyle = useAnimatedStyle(() => ({
    bottom: inputHeight.value + panelGapAboveInput,
  }));

  if (!isReasoningPanelOpen || options.length === 0) {
    return null;
  }

  const currentOption = getChatInputReasoningEffortOption(reasoningEffort);
  const isMaxEffort = reasoningEffort === REASONING_EFFORT.MAX;

  // No zIndex: the floating input (z-10) stays above the backdrop so the pill
  // keeps toggling; the panel itself sits above the input vertically anyway.
  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      <Pressable
        accessibilityLabel={t('common.close')}
        accessibilityRole="button"
        className="absolute inset-0"
        onPress={closeReasoningPanel}
      />
      <KeyboardStickyView
        offset={{ opened: getChatInputKeyboardStickyOffset(bottom) }}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          className="absolute rounded-2xl border border-border bg-field p-4 ios:shadow-field android:shadow-sm"
          entering={panelEntering}
          exiting={panelExiting}
          style={[
            {
              left: chatInputHorizontalScreenInset,
              right: chatInputHorizontalScreenInset,
            },
            positionStyle,
          ]}
          testID="chat-input-reasoning-panel"
        >
          <View className="flex-row items-baseline gap-1.5">
            <Text className="font-medium text-base text-foreground">
              {t('chat.reasoning.title')}
            </Text>
            <Text
              className="font-semibold text-base text-foreground"
              style={
                isMaxEffort ? { color: thinkingAccentColor[isDark ? 'dark' : 'light'] } : undefined
              }
            >
              {currentOption ? t(currentOption.labelKey) : ''}
            </Text>
          </View>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-accent text-sm">{t('chat.reasoning.faster')}</Text>
            <Text className="text-accent text-sm">{t('chat.reasoning.smarter')}</Text>
          </View>
          <View className="mt-2">
            <EffortSlider
              accessibilityLabel={t('chat.reasoning.title')}
              onChange={handleChange}
              options={options}
              pixelFieldValue={REASONING_EFFORT.MAX}
              value={reasoningEffort}
            />
          </View>
        </Animated.View>
      </KeyboardStickyView>
    </View>
  );
}
