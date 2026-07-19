import {
  defaultSearchScope,
  getSearchScopeAtIndex,
  getSearchScopeForTabRoute,
  getSearchScopeIndex,
} from '../searchScope';

describe('search scope', () => {
  test.each([
    ['assistants', 'assistants'],
    ['(messages)', 'messages'],
    ['settings', 'settings'],
    ['home', 'messages'],
    ['unknown', 'messages'],
  ])('maps the %s tab to the %s scope', (routeName, expectedScope) => {
    expect(getSearchScopeForTabRoute(routeName)).toBe(expectedScope);
  });

  test('maps scopes and pager indexes in both directions', () => {
    expect(getSearchScopeIndex('assistants')).toBe(0);
    expect(getSearchScopeIndex('messages')).toBe(1);
    expect(getSearchScopeIndex('settings')).toBe(2);
    expect(getSearchScopeAtIndex(2)).toBe('settings');
    expect(getSearchScopeAtIndex(99)).toBe(defaultSearchScope);
  });
});
