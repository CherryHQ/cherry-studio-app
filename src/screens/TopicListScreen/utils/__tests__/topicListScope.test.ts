import {
  defaultTopicListScope,
  getTopicListScopeAtIndex,
  getTopicListScopeIndex,
  topicListScopes,
} from '../topicListScope';

describe('topicListScope', () => {
  test('maps each scope to and from its pager index', () => {
    for (const scope of topicListScopes) {
      expect(getTopicListScopeAtIndex(getTopicListScopeIndex(scope))).toBe(scope);
    }
  });

  test('falls back to conversations for an unknown page', () => {
    expect(getTopicListScopeAtIndex(99)).toBe(defaultTopicListScope);
  });
});
