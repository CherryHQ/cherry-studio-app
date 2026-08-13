import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '../utils/chatInputReasoning';

/** The reasoning effort shown after the model name inside the composer's model pill. */
export function ChatInputEffortBadge({
  reasoningEffort,
}: {
  reasoningEffort: ChatInputReasoningEffort;
}) {
  const { t } = useTranslation();
  const labelKey = getChatInputReasoningEffortOption(reasoningEffort)?.labelKey;

  if (!labelKey) {
    return null;
  }

  return (
    <Text
      className="shrink-0 text-foreground text-sm"
      numberOfLines={1}
      testID="chat-input-model-effort-label"
    >
      {t(labelKey)}
    </Text>
  );
}
