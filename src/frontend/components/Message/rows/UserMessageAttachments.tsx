import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fileAttachmentNoticeKeys } from '@/frontend/utils/fileAttachmentFeedback';

import { MessageFileStrip } from '../parts/MessageFileStrip';
import type { UserMessageAttachmentPart } from './partitionUserMessageParts';

type UserMessageAttachmentsProps = {
  attachments: readonly UserMessageAttachmentPart[];
};

/** Files and their send-time processing notices stay together above the user's bubble. */
export function UserMessageAttachments({ attachments }: UserMessageAttachmentsProps) {
  const { t } = useTranslation();
  return (
    <View className="max-w-full gap-2 self-end">
      <MessageFileStrip parts={attachments.map(({ part }) => part)} />
      {attachments.map(({ index, part, report }) => {
        const notices = fileAttachmentNoticeKeys(report);
        return notices.length > 0 ? (
          <Text className="text-sm text-muted-foreground" key={`${part.url}:${index}`}>
            {t('attachments.notice.withFilename', {
              name: part.filename ?? t('chat.media.file'),
              notice: notices.map((key) => t(key)).join(' '),
            })}
          </Text>
        ) : null;
      })}
    </View>
  );
}
