import { MessagePart } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import { PartMarkdown } from './PartMarkdown';
import { useThinkingTimerMs } from './useThinkingTimerMs';

type ReasoningPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'reasoning' }>;
};

export function ReasoningPart({ isStreaming, part }: ReasoningPartProps) {
  const { t } = useTranslation();
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
    <MessagePart.Reasoning
      detailTitle={t('chat.reasoningStatus.title')}
      state={isThinking ? 'running' : 'complete'}
      statusText={statusText}
    >
      <PartMarkdown isStreaming={isStreaming} markdown={part.text} selectable />
    </MessagePart.Reasoning>
  );
}
