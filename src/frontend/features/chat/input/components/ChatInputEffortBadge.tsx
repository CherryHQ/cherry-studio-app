import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { cn } from '@cherrystudio/ui/utils';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '../utils/chatInputReasoning';

/**
 * The reasoning effort, shown after the model name inside the composer's model
 * pill. `max` stands out in Cherry's brand color — deliberately `brand` and not
 * `primary`, which is the user's colour and would recolour this mark.
 */
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
      className={cn(
        'shrink-0 text-sm',
        reasoningEffort === REASONING_EFFORT.MAX ? 'text-brand' : 'text-foreground',
      )}
      numberOfLines={1}
      testID="chat-input-model-effort-label"
    >
      {t(labelKey)}
    </Text>
  );
}
