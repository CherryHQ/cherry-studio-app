import { PaintbrushIcon } from '@cherrystudio/app-icons';

import {
  type ChatInputActionId,
  getChatInputAction,
  toggleChatInputAction,
} from '../chatInputActions';

describe('chat input actions', () => {
  test('finds an action by id', () => {
    const createImageAction = getChatInputAction('create-image');

    expect(createImageAction?.titleKey).toBe('chat.actions.createImage');
    expect(createImageAction?.icon).toBe(PaintbrushIcon);
  });

  test('returns undefined when no action is selected', () => {
    expect(getChatInputAction(null)).toBeUndefined();
  });

  test('selects a different action', () => {
    expect(toggleChatInputAction('create-image', 'web-search')).toBe('web-search');
  });

  test('clears the action when the same action is selected again', () => {
    expect(toggleChatInputAction('web-search', 'web-search')).toBeNull();
  });

  test('selects an action when nothing is selected', () => {
    expect(toggleChatInputAction(null, 'web-search' satisfies ChatInputActionId)).toBe(
      'web-search',
    );
  });
});
