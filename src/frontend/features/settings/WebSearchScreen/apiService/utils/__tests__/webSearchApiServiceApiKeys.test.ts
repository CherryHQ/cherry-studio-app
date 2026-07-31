import {
  buildWebSearchApiKeyEntries,
  buildWebSearchApiKeysInput,
  normalizeWebSearchApiKeys,
  parseWebSearchApiKeysInput,
} from '../webSearchApiServiceApiKeys';

describe('web search api service api keys', () => {
  test('normalizes api key strings', () => {
    expect(normalizeWebSearchApiKeys([' key-a ', '', 'key-b', 'key-a'])).toEqual([
      'key-a',
      'key-b',
    ]);
  });

  test('parses comma and newline separated input', () => {
    expect(parseWebSearchApiKeysInput(' key-a, key-b\nkey-c ,, key-a ')).toEqual([
      'key-a',
      'key-b',
      'key-c',
    ]);
  });

  test('formats api keys for the summary input', () => {
    expect(buildWebSearchApiKeysInput(['key-a', ' key-b ', 'key-a'])).toBe('key-a,key-b');
  });

  test('builds transient ui entries from persisted keys', () => {
    expect(buildWebSearchApiKeyEntries(['key-a', 'key-b'])).toEqual([
      { id: 'websearch-key-0-key-a', isNew: false, key: 'key-a' },
      { id: 'websearch-key-1-key-b', isNew: false, key: 'key-b' },
    ]);
  });
});
