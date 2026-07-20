import { View } from 'react-native';
import type { Message } from '@/data/types/message';
import { MessageParts } from '../../messageContent';
import { PrismSweep } from '../../prismSweep';

type AssistantMessageItemProps = {
  message: Message;
};

export function AssistantMessageItem({ message }: AssistantMessageItemProps) {
  const isPendingEmptyMessage = message.status === 'pending' && !message.data.parts?.length;

  return (
    <View className="w-full gap-2 px-4 py-3">
      {isPendingEmptyMessage ? (
        <View className="items-start py-1">
          <PrismSweep active size={16} />
        </View>
      ) : (
        <MessageParts message={message} />
      )}
    </View>
  );
}
