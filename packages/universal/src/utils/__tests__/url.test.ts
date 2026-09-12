import { isHttpUrl } from '../url';

describe('isHttpUrl', () => {
  test.each(['https://cherry-ai.com', 'http://localhost:8080/path'])('accepts %s', (value) => {
    expect(isHttpUrl(value)).toBe(true);
  });

  test.each(['file:///tmp/a', 'ftp://example.com', '/relative', 'not a URL'])(
    'rejects %s',
    (value) => {
      expect(isHttpUrl(value)).toBe(false);
    },
  );
});
