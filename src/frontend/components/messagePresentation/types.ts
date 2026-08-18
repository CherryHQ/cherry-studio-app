import type { Message } from '@cherrystudio/universal/data/types/message';
import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type MessagePresentationItem = Readonly<
  Pick<Message, 'data' | 'id' | 'status'> & {
    role: 'assistant' | 'user';
  }
>;

export type MessageListProps = {
  bottomAccessoryHeight?: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  enteringMessageId?: string;
  extraData?: unknown;
  keyboardOffset: number;
  messages: readonly MessagePresentationItem[];
  onLoadOlder?: () => Promise<void>;
  onReady?: () => void;
  renderMessage: MessageRenderer;
};

export type MessageRenderer = (message: MessagePresentationItem) => ReactNode;
