import { View } from 'react-native';

import { MessageFileStrip } from '../parts/MessageFileStrip';
import type { UserMessageAttachmentPart } from './partitionUserMessageParts';

type UserMessageAttachmentsProps = {
  attachments: readonly UserMessageAttachmentPart[];
};

/**
 * The same file strip the assistant side renders inline, pulled above the
 * bubble because the bubble is one visual unit that attachments cannot sit
 * inside, and aligned right to stay with the user's column.
 */
export function UserMessageAttachments({ attachments }: UserMessageAttachmentsProps) {
  return (
    <View className="max-w-full self-end">
      <MessageFileStrip parts={attachments.map(({ part }) => part)} />
    </View>
  );
}
