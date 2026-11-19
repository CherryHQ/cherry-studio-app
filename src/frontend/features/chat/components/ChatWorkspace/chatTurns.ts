import type { HistoryPosition } from '@/frontend/appShell/conversation/remote';
import type { MessageListHandle } from '@/frontend/components/Message';

export type ChatTurn = {
  id: string;
  preview: string;
  activeNodeId?: string | null;
  position?: HistoryPosition;
};

export type ChatTurnPage = { items: readonly ChatTurn[]; next?: HistoryPosition };

export type ChatTurnNavigator = {
  scope: string;
  queryKey: readonly unknown[];
  /** The desktop source has no total count, so its ordinal stays relative to the newest turn. */
  numbersFromLatest?: boolean;
  read(position: HistoryPosition | undefined, signal: AbortSignal): Promise<ChatTurnPage>;
  jump(
    turn: ChatTurn,
    scrollToMessage: MessageListHandle['scrollToMessage'],
  ): void | Promise<'restored' | 'unavailable' | 'retryable' | 'cancelled'>;
};
