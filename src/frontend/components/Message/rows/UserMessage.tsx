import TriangleAlertIcon from '@cherrystudio/app-icons/icons/triangle-alert';
import { memo, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FilePart } from '../parts/FilePart';
import { MessageParts } from '../parts/MessageParts';
import type { MessageListItem } from '../types';
import { attachmentNotices } from './attachmentNotices';
import { partitionUserMessageParts } from './partitionUserMessageParts';
import { UserMessageAttachments } from './UserMessageAttachments';
import {
  USER_MESSAGE_BUBBLE_HORIZONTAL_PADDING,
  USER_MESSAGE_BUBBLE_VERTICAL_PADDING,
} from './userMessageLayout';

type UserMessageProps = {
  attachments?: ReactNode;
  message: MessageListItem;
  /** The message this one replies to, under the bubble. */
  quote?: ReactNode;
  variant?: 'default' | 'selection';
  editingContext?: 'question' | 'continuation';
};

export const UserMessage = memo(function UserMessage({
  attachments,
  message,
  quote,
  variant = 'default',
  editingContext,
}: UserMessageProps) {
  const { t } = useTranslation();
  const { attachments: fileParts, bodyMessage } = useMemo(
    () => partitionUserMessageParts(message),
    [message],
  );
  // Source-owned attachment cards report their own delivery.
  const notices = attachments ? [] : attachmentNotices(fileParts, t);

  return (
    <View className="w-full items-end">
      <View
        className={variant === 'selection' ? 'w-[86%] items-end gap-2' : 'w-[88%] items-end gap-2'}
      >
        {attachments || fileParts.length > 0 ? (
          <View className="w-full items-end gap-1">
            <UserMessageAttachments>
              {attachments ?? fileParts.map(({ part }) => <FilePart key={part.url} part={part} />)}
            </UserMessageAttachments>
            {notices.length > 0 ? (
              <View className="w-full items-end gap-1">
                {notices.map((notice) =>
                  notice.tone === 'neutral' ? (
                    <Text className="text-right text-muted-foreground text-xs" key={notice.key}>
                      {notice.text}
                    </Text>
                  ) : (
                    <View className="flex-row items-start gap-1.5" key={notice.key}>
                      <TriangleAlertIcon className="mt-0.5 size-3.5 text-warning" />
                      <Text className="shrink text-muted-foreground text-xs">{notice.text}</Text>
                    </View>
                  ),
                )}
              </View>
            ) : null}
          </View>
        ) : null}
        {bodyMessage ? (
          <View
            className={
              editingContext === 'continuation'
                ? 'self-end rounded-[18px] bg-transparent'
                : 'self-end rounded-[18px] bg-chat-user'
            }
            style={styles.bubble}
          >
            {editingContext === 'question' ? (
              <View
                pointerEvents="none"
                className="absolute inset-0 rounded-[18px] border-[1.5px] border-border-selected"
                testID="editing-question-outline"
              />
            ) : null}
            <MessageParts message={bodyMessage} renderMode="plainText" />
          </View>
        ) : null}
        {quote}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bubble: {
    paddingHorizontal: USER_MESSAGE_BUBBLE_HORIZONTAL_PADDING,
    paddingVertical: USER_MESSAGE_BUBBLE_VERTICAL_PADDING,
  },
});
