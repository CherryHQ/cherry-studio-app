import { PrismSweep } from '@cherrystudio/ui/components';
import { Text, View } from 'react-native';
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
          {/*
           * 撑住一行正文的行高。这一行占的是「第一段内容将要出现的位置」，而无论先到的是思考
           * 状态行、工具调用行还是正文，第一行都是一行 `text-base`——只让圆点（20px）撑高会矮
           * 4px，切换那一帧整条助手消息在锚点正下方跳一下（实测 48px → 52px）。
           *
           * 只能靠同款文字撑：行高随字号档位变（`--ui-text-base--line-height`），写死数值会在
           * 别的档位重新失配。NBSP 而不是空格，是因为格式化器会把纯空格的 JSX 子节点折掉。
           */}
          <Text accessible={false} className="text-base">
            {'\u00A0'}
          </Text>
        </View>
      ) : (
        <MessageParts message={message} />
      )}
    </Animated.View>
  );
}
