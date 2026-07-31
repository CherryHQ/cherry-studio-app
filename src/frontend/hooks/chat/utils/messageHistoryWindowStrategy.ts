import { messageWindowPolicy } from './messageWindowPolicy';

export type MessageHistoryWindowState = {
  hasHiddenMessages: boolean;
  hiddenMessageCount: number;
};

export type OlderLoadAction = 'fetch' | 'reveal';

export function getOlderLoadAction(state: MessageHistoryWindowState): OlderLoadAction {
  return state.hasHiddenMessages ? 'reveal' : 'fetch';
}

export function shouldPrefetchOlderMessages(state: MessageHistoryWindowState) {
  return state.hiddenMessageCount <= messageWindowPolicy.revealCount;
}
