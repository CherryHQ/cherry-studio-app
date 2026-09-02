import { memo } from 'react';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import type { MessageListItem, MessageRenderer } from '../types';
import { MESSAGE_ROW_HORIZONTAL_PADDING, MESSAGE_ROW_VERTICAL_PADDING } from './messageListLayout';

type MessageListRowProps = {
  /** Keeps LegendList's external invalidation token visible to the memo boundary. */
  extraData?: unknown;
  message: MessageListItem;
  renderMessage: MessageRenderer;
};

export const MessageListRow = memo(function MessageListRow({
  message,
  renderMessage,
}: MessageListRowProps) {
  return <View style={messageRowStyles[message.role]}>{renderMessage(message)}</View>;
});

const styles = StyleSheet.create({
  assistant: {
    paddingVertical: MESSAGE_ROW_VERTICAL_PADDING.assistant,
  },
  root: {
    paddingHorizontal: MESSAGE_ROW_HORIZONTAL_PADDING,
  },
  user: {
    paddingVertical: MESSAGE_ROW_VERTICAL_PADDING.user,
  },
});

const messageRowStyles = {
  assistant: [styles.root, styles.assistant],
  system: undefined,
  user: [styles.root, styles.user],
} satisfies Record<MessageListItem['role'], StyleProp<ViewStyle>>;
