import {
  type ChatInputActionId,
  getChatInputAction,
  toggleChatInputAction,
} from '../chatInputActions';

describe('chat input actions', () => {
  test('finds an action by id', () => {
    expect(getChatInputAction('think')?.titleKey).toBe('chat.actions.think');
  });

  test('returns undefined when no action is selected', () => {
    expect(getChatInputAction(null)).toBeUndefined();
  });

  test('selects a different action', () => {
    expect(toggleChatInputAction('think', 'web-search')).toBe('web-search');
  });

  test('clears the action when the same action is selected again', () => {
    expect(toggleChatInputAction('think', 'think')).toBeNull();
  });

  test('selects an action when nothing is selected', () => {
    expect(toggleChatInputAction(null, 'add-file' satisfies ChatInputActionId)).toBe('add-file');
  });
});
