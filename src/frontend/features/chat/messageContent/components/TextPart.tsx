import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { Text } from 'heroui-native/text';

import type { ResolvedCitationText } from '../citations';
import type { MessagePartRenderMode } from './MessageParts';
import { PartMarkdown } from './PartMarkdown';

type TextPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'text' }>;
  renderMode?: MessagePartRenderMode;
  resolvedText?: ResolvedCitationText;
};

export function TextPart({
  isStreaming,
  part,
  renderMode = 'markdown',
  resolvedText,
}: TextPartProps) {
  if (renderMode === 'plainText') {
    return (
      <Text className="leading-6" type="body">
        {resolvedText?.plainText ?? part.text}
      </Text>
    );
  }

  return <PartMarkdown isStreaming={isStreaming} markdown={resolvedText?.markdown ?? part.text} />;
}
