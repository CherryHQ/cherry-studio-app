import { ScrollView, StyleSheet, View } from 'react-native';

import { FilePart } from '../../messageContent';
import type { UserMessageAttachmentPart } from '../utils/partitionUserMessageParts';

const USER_MESSAGE_ATTACHMENT_SIZE = 112;

type UserMessageAttachmentStripProps = {
  attachments: readonly UserMessageAttachmentPart[];
  messageId: string;
};

export function UserMessageAttachmentStrip({
  attachments,
  messageId,
}: UserMessageAttachmentStripProps) {
  return (
    <View className="max-w-full self-end" style={styles.strip}>
      <ScrollView
        alwaysBounceHorizontal={false}
        className="max-w-full"
        contentContainerClassName="gap-2"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
      >
        {attachments.map(({ index, part }) => (
          <FilePart key={`${messageId}-attachment-${index}`} part={part} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: USER_MESSAGE_ATTACHMENT_SIZE,
  },
});
