import { ContentState } from '@cherrystudio/ui/components';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { ErrorBoundary } from '@/frontend/components/ErrorBoundary';

import type { MessageListItem, MessageRenderer } from '../types';
import { MESSAGE_ROW_HORIZONTAL_PADDING, MESSAGE_ROW_VERTICAL_PADDING } from './messageListLayout';

type MessageListRowProps = {
  /** Keeps LegendList's external invalidation token visible to the memo boundary. */
  extraData?: unknown;
  message: MessageListItem;
  renderMessage: MessageRenderer;
  insets?: { horizontal: number; user: number; assistant: number };
};

export const MessageListRow = memo(function MessageListRow({
  extraData,
  message,
  renderMessage,
  insets,
}: MessageListRowProps) {
  return (
    <View
      style={
        insets && message.role !== 'system'
          ? { paddingHorizontal: insets.horizontal, paddingVertical: insets[message.role] }
          : messageRowStyles[message.role]
      }
    >
      {/* One message that cannot render must not take the conversation down with it. */}
      <ErrorBoundary
        fallback={renderMessageFailure}
        operation="message.render"
        resetKeys={[message, extraData, renderMessage]}
      >
        <MessageRowContent message={message} renderMessage={renderMessage} />
      </ErrorBoundary>
    </View>
  );
});

// The renderer runs here, inside the boundary, so a throw from the renderer
// itself is contained as well as one from the components it returns.
function MessageRowContent({ message, renderMessage }: Omit<MessageListRowProps, 'extraData'>) {
  return renderMessage(message);
}

function renderMessageFailure() {
  return <MessageRenderFailure />;
}

function MessageRenderFailure() {
  const { t } = useTranslation();

  return <ContentState.Error description={t('chat.message.renderFailed')} layout="leading" />;
}

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
