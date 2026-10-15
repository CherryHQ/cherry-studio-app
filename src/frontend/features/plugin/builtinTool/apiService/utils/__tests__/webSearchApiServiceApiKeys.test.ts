import {
  buildWebSearchApiKeysInput,
  parseWebSearchApiKeysInput,
} from '../webSearchApiServiceApiKeys';

describe('web search api service api keys', () => {
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
});
