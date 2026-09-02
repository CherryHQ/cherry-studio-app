import { MessagePart } from '@cherrystudio/ui/components';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MessageParts } from '../parts/MessageParts';
import type { MessageListItem } from '../types';

type AssistantMessageProps = {
  /**
   * 正文之后的组合槽位，留给功能方自己的配件（工具栏之类）。这里无条件渲染，包括
   * 正文还没到的 pending 占位期——配件拿得到 message，什么时候现身由它自己决定。
   */
  children?: ReactNode;
  isTextSelectionEnabled?: boolean;
  message: MessageListItem;
};

// 正文渲染很贵（parts 分派、markdown），所以单独立一层 memo：配件重渲染时 children 的
// JSX 身份必然变、外层 memo 必然被打穿，正文得由这一层按 message 引用挡住。
const AssistantMessageBody = memo(function AssistantMessageBody({
  isTextSelectionEnabled,
  message,
}: {
  isTextSelectionEnabled: boolean;
  message: MessageListItem;
}) {
  const { t } = useTranslation();
  const isPendingEmptyMessage = message.status === 'pending' && !message.data.parts?.length;

  return isPendingEmptyMessage ? (
    <MessagePart.Pending accessibilityLabel={t('chat.message.waitingForResponse')} />
  ) : (
    <MessageParts isTextSelectionEnabled={isTextSelectionEnabled} message={message} />
  );
});

export const AssistantMessage = memo(function AssistantMessage({
  children,
  isTextSelectionEnabled = true,
  message,
}: AssistantMessageProps) {
  return (
    <View className="w-full gap-2">
      <AssistantMessageBody isTextSelectionEnabled={isTextSelectionEnabled} message={message} />
      {children}
    </View>
  );
});
