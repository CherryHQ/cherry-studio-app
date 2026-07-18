import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EffortSlider, thinkingAccentColor } from '@/components/effortSlider';
import {
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import { useChatInputReasoningEfforts } from '@/screens/ChatScreen/input/hooks/useChatInputReasoningEfforts';
import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '@/screens/ChatScreen/input/utils/chatInputReasoning';

/**
 * Reasoning-effort block pinned below the model list in the model picker
 * sheet: the selected model decides the available stops, so the control lives
 * beside model selection. Owns its top divider and safe-area bottom padding
 * (the sheet reaches the physical screen bottom) so that rendering nothing —
 * when the model has no reasoning stops — leaves no stray chrome.
 */
export function ChatInputReasoningSection() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { reasoningEffort } = useChatInputState();
  const { selectReasoningEffort } = useChatInputActions();
  const reasoningEfforts = useChatInputReasoningEfforts();

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

  if (options.length === 0) {
    return null;
  }

  const currentOption = getChatInputReasoningEffortOption(reasoningEffort);
  const isMaxEffort = reasoningEffort === REASONING_EFFORT.MAX;

  return (
    <View
      className="border-border border-t px-4 pt-4"
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      testID="chat-input-reasoning-section"
    >
      <View className="flex-row items-baseline gap-1.5">
        <Text className="font-medium text-base text-foreground">{t('chat.reasoning.title')}</Text>
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
    </View>
  );
}
