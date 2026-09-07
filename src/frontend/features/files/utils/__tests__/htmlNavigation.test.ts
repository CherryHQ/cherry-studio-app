import { htmlNavigationAction } from '../htmlNavigation';

it.each(['about:blank', 'about:blank#section'])('keeps the document and its anchors: %s', (url) => {
  expect(htmlNavigationAction(url)).toBe('allow');
});

it.each(['https://example.com/chart', 'http://example.com'])(
  'opens web links externally: %s',
  (url) => {
    expect(htmlNavigationAction(url)).toBe('external');
  },
);

it.each([
  'file:///private/data.sqlite',
  'content://files/secret',
  'javascript:alert(1)',
  'data:text/html,<script></script>',
  'intent://example',
  'cherrystudio://settings',
  'about:blank.evil',
  '/relative.html',
  'not a url',
])('blocks local files, arbitrary schemes and malformed destinations: %s', (url) => {
  expect(htmlNavigationAction(url)).toBe('block');
});

it('does not turn an embedded frame navigation into an external browser action', () => {
  expect(htmlNavigationAction('https://example.com', false)).toBe('block');
});
