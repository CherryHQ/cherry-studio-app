import { PrismSweep } from '@cherrystudio/ui/components';
import Animated from 'react-native-reanimated';

import { MessageStatusRow, StatusRowTextFloor } from '../../components/MessageStatusRow';
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
        // 这一行不含文字，所以要自己撑到一行正文的高度——否则只有 20px 的圆点撑高，比接下来
        // 顶替它的思考行/工具行/正文矮 4px，切换那一帧整条消息在锚点正下方跳一下（48→52）。
        <MessageStatusRow>
          <PrismSweep active />
          <StatusRowTextFloor />
        </MessageStatusRow>
      ) : (
        <MessageParts message={message} />
      )}
    </Animated.View>
  );
}
