import { Button, MessagePart } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { useMessageListDisclosureToggle } from '../list/MessageListDisclosureContext';
import { PartMarkdown } from './PartMarkdown';

type ReasoningPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'reasoning' }>;
};

const MAX_VISIBLE_REASONING_CHARS = 8192;

function reasoningPage(text: string, selectedEnd: number | null) {
  let end = Math.min(selectedEnd ?? text.length, text.length);
  if (
    end < text.length &&
    text.charCodeAt(end - 1) >= 0xd800 &&
    text.charCodeAt(end - 1) <= 0xdbff &&
    text.charCodeAt(end) >= 0xdc00 &&
    text.charCodeAt(end) <= 0xdfff
  ) {
    end -= 1;
  }
  let start = Math.max(0, end - MAX_VISIBLE_REASONING_CHARS);
  // Put a split surrogate pair wholly on the previous page.
  if (start > 0 && text.charCodeAt(start) >= 0xdc00 && text.charCodeAt(start) <= 0xdfff) {
    start += 1;
  }
  return { end, start, text: text.slice(start, end) };
}

function ReasoningContent({ isStreaming, text }: { isStreaming: boolean; text: string }) {
  const { t } = useTranslation();
  const [selectedEnd, setSelectedEnd] = useState<number | null>(null);
  const handleDisclosureToggle = useMessageListDisclosureToggle();
  const page = text.length > MAX_VISIBLE_REASONING_CHARS ? reasoningPage(text, selectedEnd) : null;

  if (!page) {
    return <PartMarkdown isStreaming={isStreaming} markdown={text} />;
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Button
          disabled={page.start === 0}
          onPress={() => {
            handleDisclosureToggle();
            setSelectedEnd(page.start);
          }}
          size="xs"
          variant="ghost"
        >
          {t('chat.reasoningPage.earlier')}
        </Button>
        <Text className="shrink text-center text-foreground-tertiary text-xs">
          {t('chat.reasoningPage.position', {
            start: page.start + 1,
            end: page.end,
            total: text.length,
          })}
        </Text>
        <Button
          disabled={page.end === text.length}
          onPress={() => {
            handleDisclosureToggle();
            const nextEnd = Math.min(text.length, page.end + MAX_VISIBLE_REASONING_CHARS);
            setSelectedEnd(nextEnd === text.length ? null : nextEnd);
          }}
          size="xs"
          variant="ghost"
        >
          {t('chat.reasoningPage.later')}
        </Button>
      </View>
      <Text className="text-base text-foreground" selectable>
        {page.text}
      </Text>
    </View>
  );
}

export function ReasoningPart({ isStreaming, part }: ReasoningPartProps) {
  const { t } = useTranslation();
  const handleDisclosureToggle = useMessageListDisclosureToggle();
  const isThinking = part.state === 'streaming';
  const statusText = t(
    isThinking ? 'chat.reasoningStatus.thinking' : 'chat.reasoningStatus.thought',
  );

  // 思考中（流式）即使文本尚未流入也要显示「思考中」状态行：否则从待生成占位切到
  // reasoning part 的那一帧会因 text 为空而 return null，助手消息塌成空壳再回弹，
  // 在锚点正下方制造高度振荡。仅当「非思考中且无文本」时才真正不渲染。
  if (!part.text && !isThinking) {
    return null;
  }

  return (
    <MessagePart.Reasoning
      onDisclosureToggle={handleDisclosureToggle}
      state={isThinking ? 'running' : 'complete'}
      statusText={statusText}
    >
      <ReasoningContent isStreaming={isStreaming} text={part.text} />
    </MessagePart.Reasoning>
  );
}
