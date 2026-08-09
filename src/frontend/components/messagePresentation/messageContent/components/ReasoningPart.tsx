import { BottomSheet, PrismSweep } from '@cherrystudio/ui/components';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';
import type { Detent } from '@swmansion/react-native-bottom-sheet';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThinkingTimerMs } from '../hooks/useThinkingTimerMs';
import { PartMarkdown } from './PartMarkdown';

type ReasoningPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'reasoning' }>;
};

// 推理详情 sheet 两档（占「安全区内高度」的比例）：默认开在 60%，可上拖到接近满高（100% 档
// 用 'content' 对齐固定卡片高度）。长推理在卡片内部滚动。
const reasoningSheetMediumFraction = 0.6;
const reasoningSheetFullFraction = 0.94;

export function ReasoningPart({ isStreaming, part }: ReasoningPartProps) {
  const { t } = useTranslation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

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
      {/* 点状态行打开推理详情 sheet（思考中也可打开、内部实时流式）；不再内联展开，避免改变
          消息高度、干扰锚定列表的滚动位置。 */}
      <Pressable
        accessibilityLabel={statusText}
        accessibilityRole="button"
        className="flex-row items-center gap-2 py-0.5 active:opacity-60"
        onPress={() => setIsSheetOpen(true)}
      >
        {isThinking ? <PrismSweep active /> : null}
        <Text className="flex-1 text-foreground text-sm" numberOfLines={1}>
          {statusText}
        </Text>
        <ChevronRightIcon className="size-4 text-foreground" strokeWidth={2} />
      </Pressable>
      {isSheetOpen ? (
        <ReasoningDetailSheet
          isStreaming={isStreaming}
          markdown={part.text}
          onClose={() => setIsSheetOpen(false)}
        />
      ) : null}
    </View>
  );
}

function ReasoningDetailSheet({
  isStreaming,
  markdown,
  onClose,
}: {
  isStreaming: boolean;
  markdown: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const available = windowHeight - insets.top - insets.bottom;
  const fullHeight = available * reasoningSheetFullFraction;
  const detents = useMemo<Detent[]>(
    () => [0, available * reasoningSheetMediumFraction, 'content'],
    [available],
  );

  return (
    <BottomSheet
      closeAccessibilityLabel={t('common.close')}
      detents={detents}
      height={fullHeight}
      onClose={onClose}
      testID="reasoning-detail"
      title={t('chat.reasoningStatus.title')}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-4"
        showsVerticalScrollIndicator={false}
      >
        <PartMarkdown isStreaming={isStreaming} markdown={markdown} />
      </ScrollView>
    </BottomSheet>
  );
}
