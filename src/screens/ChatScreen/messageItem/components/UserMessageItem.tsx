import { View } from 'react-native';

import type { Message } from '@/data/types/message';

import { MessageParts } from '../../messageContent';

type UserMessageItemProps = {
  message: Message;
};

export function UserMessageItem({ message }: UserMessageItemProps) {
  return (
    <View className="w-full items-end px-4 py-2">
      <View className="max-w-[86%] gap-2 rounded-2xl border border-border bg-surface-secondary px-4 py-3">
        <MessageParts message={message} />
      </View>
    </View>
  );
}
