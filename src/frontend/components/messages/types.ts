import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { CherryMessagePart, MessageStatus } from '@/shared/data/types/message';

export type MessageListItem = Readonly<{
  data: Readonly<{ parts?: readonly CherryMessagePart[] }>;
  id: string;
  /** Model name captured by this message's immutable inference snapshot. */
  modelName?: string;
  role: 'assistant' | 'user';
  status: MessageStatus;
}>;

export type MessageListProps = {
  bottomAccessoryHeight?: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  enteringMessageId?: string;
  extraData?: unknown;
  keyboardOffset: number;
  messages: readonly MessageListItem[];
  onLoadOlder?: () => Promise<void>;
  onReady?: () => void;
  renderMessage: MessageRenderer;
};

export type MessageRenderer = (message: MessageListItem) => ReactNode;
