import { Text } from 'heroui-native/text';

import type { CherryMessagePart } from '@/shared/data/types/message';

import type { MessagePartRenderMode } from './MessageParts';
import { PartMarkdown } from './PartMarkdown';

type TextPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'text' }>;
  renderMode?: MessagePartRenderMode;
};

export function TextPart({ isStreaming, part, renderMode = 'markdown' }: TextPartProps) {
  if (renderMode === 'plainText') {
    return <Text type="body">{part.text}</Text>;
  }

  return <PartMarkdown isStreaming={isStreaming} markdown={part.text} />;
}
