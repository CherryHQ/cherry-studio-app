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

  // 思考中（流式）即使文本尚未流入也要显示「思考中」状态行：否则从待生成占位切到
  // reasoning part 的那一帧会因 text 为空而 return null，助手消息塌成空壳再回弹，
  // 在锚点正下方制造高度振荡。仅当「非思考中且无文本」时才真正不渲染。
  if (!part.text && !isThinking) {
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
