import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { CherryMessagePart, MessageStatus } from '@/shared/data/types/message';
import type { Model } from '@/shared/data/types/model';

export type MessageListItem = Readonly<{
  /** Creation time owned by this persisted message. */
  createdAt?: string;
  data: Readonly<{
    /** Stable render identities aligned one-to-one with `parts` when the source provides them. */
    partKeys?: readonly string[];
    parts?: readonly CherryMessagePart[];
  }>;
  id: string;
  /** Model identity captured by this message's immutable inference snapshot. */
  model?: Readonly<Pick<Model, 'id' | 'modelId' | 'name' | 'providerId'>>;
  role: 'assistant' | 'user';
  status: MessageStatus;
}>;

export type MessageListProps = {
  bottomAccessoryHeight?: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  dataKey?: string;
  enteringMessageId?: string;
  extraData?: unknown;
  /** Scrolls above the first message; the caller decides when it applies. */
  headerAccessory?: ReactNode;
  initialLayoutReady?: boolean;
  keyboardOffset: number;
  messages: readonly MessageListItem[];
  onLoadOlder?: () => Promise<void>;
  onReady?: () => void;
  renderMessage: MessageRenderer;
};

export type MessageRenderer = (message: MessageListItem) => ReactNode;
