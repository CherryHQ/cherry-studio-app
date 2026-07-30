import { Text } from 'heroui-native/text';
import type { CherryMessagePart } from '@/data/types/message';
import type { MessagePartRenderMode } from './MessageParts';
import { PartMarkdown } from './PartMarkdown';

type TextPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'text' }>;
  renderMode?: MessagePartRenderMode;
};

export function TextPart({ isStreaming, part, renderMode = 'markdown' }: TextPartProps) {
  if (renderMode === 'plainText') {
    return (
      <Text className="leading-6" type="body">
        {part.text}
      </Text>
    );
  }

  return <PartMarkdown isStreaming={isStreaming} markdown={part.text} />;
}
