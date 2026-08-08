import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useUniwind } from 'uniwind';

import { thinkingAccentColor } from '../effortSlider';
import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '../utils/chatInputReasoning';

/**
 * The reasoning effort, shown after the model name inside the composer's model
 * pill. `max` borrows the effort slider's accent so the pill and the slider
 * agree on what "thinking hard" looks like.
 */
export function ChatInputEffortBadge({
  reasoningEffort,
}: {
  reasoningEffort: ChatInputReasoningEffort;
}) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const labelKey = getChatInputReasoningEffortOption(reasoningEffort)?.labelKey;

  if (!labelKey) {
    return null;
  }

  return (
    <Text
      className="shrink-0 text-default-foreground text-sm"
      numberOfLines={1}
      style={
        reasoningEffort === REASONING_EFFORT.MAX
          ? { color: thinkingAccentColor[theme === 'dark' ? 'dark' : 'light'] }
          : undefined
      }
      testID="chat-input-model-effort-label"
    >
      {t(labelKey)}
    </Text>
  );
}
