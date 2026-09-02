import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { MessageParts } from '../parts/MessageParts';
import type { MessageListItem } from '../types';
import { partitionUserMessageParts } from './partitionUserMessageParts';
import { UserMessageAttachments } from './UserMessageAttachments';
import {
  USER_MESSAGE_BUBBLE_HORIZONTAL_PADDING,
  USER_MESSAGE_BUBBLE_VERTICAL_PADDING,
} from './userMessageLayout';

type UserMessageProps = {
  message: MessageListItem;
};

export const UserMessage = memo(function UserMessage({ message }: UserMessageProps) {
  const { attachments, bodyMessage } = useMemo(() => partitionUserMessageParts(message), [message]);

  return (
    <View className="w-full items-end">
      <View className="max-w-[88%]">
        <View className="items-end gap-2">
          {attachments.length > 0 ? <UserMessageAttachments attachments={attachments} /> : null}
          {bodyMessage ? (
            <View className="self-end rounded-[18px] bg-chat-user" style={styles.bubble}>
              <MessageParts
                isTextSelectionEnabled={false}
                message={bodyMessage}
                renderMode="plainText"
              />
            </View>
          ) : null}
        </View>
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
