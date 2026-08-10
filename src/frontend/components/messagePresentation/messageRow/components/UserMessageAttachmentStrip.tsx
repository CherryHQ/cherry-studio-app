import { ScrollView, View } from 'react-native';

import { FilePart } from '../../messageContent';
import type { UserMessageAttachmentPart } from '../utils/partitionUserMessageParts';

type UserMessageAttachmentStripProps = {
  attachments: readonly UserMessageAttachmentPart[];
  messageId: string;
};

export function UserMessageAttachmentStrip({
  attachments,
  messageId,
}: UserMessageAttachmentStripProps) {
  return (
    <View className="max-w-full self-end">
      <ScrollView
        alwaysBounceHorizontal={false}
        className="max-w-full"
        contentContainerClassName="gap-2"
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {attachments.map(({ index, part }) => (
          <FilePart key={`${messageId}-attachment-${index}`} part={part} />
        ))}
      </ScrollView>
    </View>
  );
}
