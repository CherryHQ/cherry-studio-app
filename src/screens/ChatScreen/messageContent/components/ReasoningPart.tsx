import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type { CherryMessagePart } from '@/data/types/message';
import { readCherryMeta } from '@/data/types/uiParts';
import { PrismSweep } from '../../prismSweep';

import { useThinkingTimerMs } from '../hooks/useThinkingTimerMs';
import { PartMarkdown } from './PartMarkdown';

type ReasoningPartProps = {
  part: Extract<CherryMessagePart, { type: 'reasoning' }>;
};

export function ReasoningPart({ part }: ReasoningPartProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const isThinking = part.state === 'streaming';
  const cherryMeta = readCherryMeta(part);
  const displayMs = useThinkingTimerMs(isThinking, cherryMeta?.startedAt, cherryMeta?.thinkingMs);

  const statusText = useMemo(() => {
    const seconds = (Math.max(displayMs, 100) / 1000).toFixed(1);
    return isThinking
      ? t('chat.reasoningStatus.thinking', { seconds })
      : t('chat.reasoningStatus.thought', { seconds });
  }, [displayMs, isThinking, t]);

  if (!part.text) {
    return null;
  }

  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityLabel={statusText}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        className="flex-row items-center gap-2 py-0.5 active:opacity-60"
        onPress={() => setIsExpanded((expanded) => !expanded)}
      >
        {isThinking ? <PrismSweep active size={16} /> : null}
        <Text className="flex-1 text-default-foreground text-sm" numberOfLines={1}>
          {statusText}
        </Text>
        <View className={isExpanded ? 'rotate-90' : undefined}>
          <ChevronRightIcon className="size-4 text-default-foreground" strokeWidth={2} />
        </View>
      </Pressable>
      {isExpanded ? (
        <View className="rounded-xl bg-surface-secondary px-3 py-2.5">
          <PartMarkdown markdown={part.text} />
        </View>
      ) : null}
    </View>
  );
}
