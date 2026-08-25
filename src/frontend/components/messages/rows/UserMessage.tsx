import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useUserMessageSlideInStyle } from '../motion/useUserMessageSlideInStyle';
import { MessageParts } from '../parts/MessageParts';
import type { MessageListItem } from '../types';
import { partitionUserMessageParts } from './partitionUserMessageParts';
import { UserMessageAttachments } from './UserMessageAttachments';

type UserMessageProps = {
  message: MessageListItem;
};

export const UserMessage = memo(function UserMessage({ message }: UserMessageProps) {
  const slideInStyle = useUserMessageSlideInStyle(message.id);
  const { attachments, bodyMessage } = useMemo(() => partitionUserMessageParts(message), [message]);

  return (
    <Animated.View className="w-full items-end px-4 py-2" style={slideInStyle}>
      <View className="max-w-[86%]">
        <View className="items-end gap-2">
          {attachments.length > 0 ? (
            <UserMessageAttachments attachments={attachments} messageId={message.id} />
          ) : null}
          {bodyMessage ? (
            <View className="self-end rounded-xl bg-chat-user p-2">
              <MessageParts message={bodyMessage} renderMode="plainText" />
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
});
