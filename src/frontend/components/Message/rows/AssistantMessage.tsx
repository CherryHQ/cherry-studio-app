import { memo, type ReactNode } from 'react';
import { View } from 'react-native';

import { imageParamsAspectRatio } from '@/shared/utils/imageGenerationParams';

import { MessageParts } from '../parts/MessageParts';
import { PendingImagePart } from '../parts/PendingImagePart';
import type { MessageListItem } from '../types';

type AssistantMessageProps = {
  /**
   * 正文之后的组合槽位，留给功能方自己的配件（工具栏之类）。这里无条件渲染，包括
   * 正文还没到的 pending 占位期——配件拿得到 message，什么时候现身由它自己决定。
   */
  children?: ReactNode;
  message: MessageListItem;
};

// 正文渲染很贵（parts 分派、markdown），所以单独立一层 memo：配件重渲染时 children 的
// JSX 身份必然变、外层 memo 必然被打穿，正文得由这一层按 message 引用挡住。
const AssistantMessageBody = memo(function AssistantMessageBody({
  message,
}: {
  message: MessageListItem;
}) {
  const parts = message.data.parts ?? [];
  const isPending = message.status === 'pending';
  const isPendingEmptyMessage =
    isPending &&
    !parts.some((part) => part.type !== 'data-compaction-anchor' || part.data.status !== 'skipped');

  if (isPendingEmptyMessage && message.imageGeneration) {
    return (
      <PendingImagePart
        aspectRatio={imageParamsAspectRatio(message.imageGeneration.paramValues)}
        testID="chat-image-generation-loader"
      />
    );
  }

  return <MessageParts message={message} />;
});

export const AssistantMessage = memo(function AssistantMessage({
  children,
  message,
}: AssistantMessageProps) {
  return (
    <View className="w-full gap-2">
      <AssistantMessageBody message={message} />
      {children}
    </View>
  );
});
