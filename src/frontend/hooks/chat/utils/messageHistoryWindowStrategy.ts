export type MessageHistoryWindowState = {
  hasHiddenMessages: boolean;
  hiddenMessageCount: number;
};

export type OlderLoadAction = 'fetch' | 'reveal';

export function getOlderLoadAction(state: MessageHistoryWindowState): OlderLoadAction {
  return state.hasHiddenMessages ? 'reveal' : 'fetch';
}
