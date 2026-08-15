import { PrismSweep } from '@cherrystudio/ui/components';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { MessageParts } from '../../messageContent';
import type { MessagePresentationItem } from '../../types';
import { useAssistantSlideInStyle } from '../slideIn/hooks/useAssistantSlideInStyle';

type AssistantMessageRowProps = {
  message: MessagePresentationItem;
};

export function AssistantMessageRow({ message }: AssistantMessageRowProps) {
  const isPendingEmptyMessage = message.status === 'pending' && !message.data.parts?.length;
  // 行高从第一帧起就要占住（预留空白与钉顶落点都靠它），所以显形只走 opacity。
  const slideInStyle = useAssistantSlideInStyle(message.id);

  return (
    <Animated.View className="w-full gap-2 px-4 py-3" style={slideInStyle}>
      {isPendingEmptyMessage ? (
        // 布局与 ReasoningPart 的「思考中」行保持一致（flex-row + gap-2 + py-0.5），
        // 这样待生成占位切换到流式的思考块时，圆点位置连续、不会横向/纵向跳一下。
        <View className="flex-row items-center gap-2 py-0.5">
          <PrismSweep active />
        </View>
      ) : (
        <MessageParts message={message} />
      )}
    </Animated.View>
  );
}
