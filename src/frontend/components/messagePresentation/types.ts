import type { Message } from '@cherrystudio/universal/data/types/message';
import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type MessagePresentationItem = Readonly<
  Pick<Message, 'data' | 'id' | 'status'> & {
    role: 'assistant' | 'user';
  }
>;

export type AssistantReadAloudInput = {
  language?: string;
  messageId: string;
  text: string;
};

export type AssistantMessageActions = {
  copiedMessageId?: string;
  isRegenerateDisabled: boolean;
  onCopy: (input: { messageId: string; text: string }) => void;
  onRegenerate: (messageId: string) => void;
};

export type MessageListProps = {
  animateFirstEnteringMessage?: boolean;
  assistantActions?: AssistantMessageActions;
  bottomAccessoryHeight?: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  enteringMessageId?: string;
  keyboardOffset: number;
  messages: readonly MessagePresentationItem[];
  onLoadOlder?: () => Promise<void>;
  onReady?: () => void;
  renderAssistantMessage?: (message: MessagePresentationItem) => ReactNode;
};
