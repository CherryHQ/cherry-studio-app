import { DotMatrixSquare20 } from '@cherrystudio/ui/components';
import { memo } from 'react';
import Animated from 'react-native-reanimated';

import { MessageStatusRow, StatusRowTextFloor } from '../../components/MessageStatusRow';
import { MessageParts } from '../../messageContent';
import type { AssistantMessageActions, MessagePresentationItem } from '../../types';
import { useAssistantSlideInStyle } from '../slideIn/hooks/useAssistantSlideInStyle';
import { AssistantMessageToolbar } from './AssistantMessageToolbar';

type AssistantMessageRowProps = {
  actions?: AssistantMessageActions;
  message: MessagePresentationItem;
};

const AssistantMessageBody = memo(function AssistantMessageBody({
  message,
}: {
  message: MessagePresentationItem;
}) {
  const isPendingEmptyMessage = message.status === 'pending' && !message.data.parts?.length;

  return isPendingEmptyMessage ? (
    // 这一行不含文字，所以要自己撑到一行正文的高度——否则只有 20px 的圆点撑高，比接下来
    // 顶替它的思考行/工具行/正文矮 4px，切换那一帧整条消息在锚点正下方跳一下（48→52）。
    <MessageStatusRow>
      <DotMatrixSquare20 active size={20} />
      <StatusRowTextFloor />
    </MessageStatusRow>
  ) : (
    <MessageParts message={message} />
  );
});

export function AssistantMessageRow({ actions, message }: AssistantMessageRowProps) {
  // 行高从第一帧起就要占住（预留空白与钉顶落点都靠它），所以显形只走 opacity。
  const slideInStyle = useAssistantSlideInStyle(message.id);
  const isCopied = actions?.copiedMessageId === message.id;

  return (
    <Animated.View className="w-full gap-2 px-4 py-3" style={slideInStyle}>
      <AssistantMessageBody message={message} />
      {actions && message.status !== 'pending' ? (
        <AssistantMessageToolbar
          isCopied={isCopied}
          isRegenerateDisabled={actions.isRegenerateDisabled}
          message={message}
          onCopy={actions.onCopy}
          onRegenerate={actions.onRegenerate}
        />
      ) : null}
    </Animated.View>
  );
}
