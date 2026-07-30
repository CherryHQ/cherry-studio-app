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
        // 布局与 ReasoningPart 的「思考中」行保持一致（flex-row + gap-2 + py-0.5），
        // 这样待生成占位切换到流式的思考块时，圆点位置连续、不会横向/纵向跳一下。
        <View className="flex-row items-center gap-2 py-0.5">
          <PrismSweep active size={16} />
        </View>
      ) : (
        <MessageParts message={message} />
      )}
    </View>
  );
}
