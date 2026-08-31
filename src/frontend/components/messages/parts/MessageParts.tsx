import { View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import type { MessageListItem } from '../types';
import { ArtifactGroup } from './ArtifactGroup';
import { resolveMessageCitationText } from './citations';
import { MessagePartRenderer } from './MessagePartRenderer';
import { SourceGroup } from './SourceGroup';

type MessagePartsProps = {
  isTextSelectionEnabled: boolean;
  message: MessageListItem;
  renderMode?: MessagePartRenderMode;
};

export type MessagePartRenderMode = 'markdown' | 'plainText';

type FilePart = Extract<CherryMessagePart, { type: 'file' }>;

function isArtifactFilePart(part: CherryMessagePart): part is FilePart {
  return part.type === 'file' && readCherryMeta(part)?.purpose === 'artifact';
}

function getMessagePartKey(
  message: MessageListItem,
  part: NonNullable<MessageListItem['data']['parts']>[number],
  index: number,
) {
  return `${message.id}-${part.type}-${index}`;
}

export function MessageParts({
  isTextSelectionEnabled,
  message,
  renderMode = 'markdown',
}: MessagePartsProps) {
  const parts = message.data.parts;

  if (!parts?.length) {
    return null;
  }

  const citationText = resolveMessageCitationText(parts);
  const artifactParts = parts.filter(isArtifactFilePart);
  const sourceParts = parts.filter((part) => part.type === 'source-url');

  return (
    <View className="gap-2">
      {parts.map((part, index) => {
        if (part.type === 'source-url' || isArtifactFilePart(part)) {
          return null;
        }

        const resolvedText = citationText.get(index);
        return (
          <MessagePartRenderer
            isStreaming={message.status === 'pending'}
            isTextSelectionEnabled={isTextSelectionEnabled}
            key={getMessagePartKey(message, part, index)}
            part={part}
            renderMode={renderMode}
            resolvedText={resolvedText}
          />
        );
      })}
      {artifactParts.length > 0 ? <ArtifactGroup parts={artifactParts} /> : null}
      {sourceParts.length > 0 ? <SourceGroup parts={sourceParts} /> : null}
    </View>
  );
}
