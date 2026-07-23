import {
  defaultMessageScope,
  getMessageScopeAtIndex,
  getMessageScopeIndex,
  messageScopes,
} from '../scope';

describe('messageScope', () => {
  test('maps each scope to and from its pager index', () => {
    for (const scope of messageScopes) {
      expect(getMessageScopeAtIndex(getMessageScopeIndex(scope))).toBe(scope);
    }
  });

  test('falls back to conversations for an unknown page', () => {
    expect(getMessageScopeAtIndex(99)).toBe(defaultMessageScope);
  });
});
