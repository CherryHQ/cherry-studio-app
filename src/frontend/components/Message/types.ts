import type { ReactNode } from 'react';
import type { ScrollViewProps } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { FileAttachmentReport } from '@/shared/contracts/fileAttachment';
import type { CherryMessagePart, MessageStats, MessageStatus } from '@/shared/data/types/message';
import type { Model } from '@/shared/data/types/model';

export type MessageListItem = Readonly<{
  /** Timeline position; synthetic rows inherit the adjacent persisted timestamp. */
  createdAt?: string;
  data: Readonly<{
    /** Stable render identities aligned one-to-one with `parts` when the source provides them. */
    partKeys?: readonly string[];
    attachmentReports?: Readonly<Record<string, FileAttachmentReport>>;
    parts?: readonly CherryMessagePart[];
  }>;
  id: string;
  /** Model identity captured by this message's immutable inference snapshot. */
  model?: Readonly<Pick<Model, 'id' | 'modelId' | 'name' | 'providerId'>>;
  role: 'assistant' | 'system' | 'user';
  /** Feature-owned timeline event synthesized beside persisted messages. */
  systemEvent?: Readonly<{
    type: 'fork-origin';
    sourceSessionId: string;
  }>;
  /** Message-owned runtime timing and materialized provider statistics. */
  stats?: MessageStats;
  status: MessageStatus;
}>;

export type MessageListProps = {
  bottomAccessoryHeight?: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  dataKey?: string;
  enteringMessageId?: string;
  extraData?: unknown;
  initialLayoutReady?: boolean;
  /** Applied once per dataKey, before restoring a saved reading position. */
  initialScrollTarget?: 'end' | { messageId: string };
  /** The loaded window ends before the current conversation's live edge. */
  hasNewerMessages?: boolean;
  keyboardOffset: number;
  /** Use 'always' when an outer press target owns background dismissal. */
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  messages: readonly MessageListItem[];
  onLoadOlder?: () => Promise<void>;
  onLoadNewer?: () => Promise<void>;
  onReturnToLatest?: () => void;
  onReady?: () => void;
  renderMessage: MessageRenderer;
};

export type MessageRenderer = (message: MessageListItem) => ReactNode;
