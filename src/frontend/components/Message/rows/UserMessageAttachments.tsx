import { View } from 'react-native';

import { MessageFileStrip } from '../parts/MessageFileStrip';
import type { UserMessageAttachmentPart } from './partitionUserMessageParts';

type UserMessageAttachmentsProps = {
  attachments: readonly UserMessageAttachmentPart[];
};

/** Attached files sit above the user's bubble. */
export function UserMessageAttachments({ attachments }: UserMessageAttachmentsProps) {
  return (
    <View className="w-full self-end">
      <MessageFileStrip parts={attachments.map(({ part }) => part)} />
    </View>
  );
}
