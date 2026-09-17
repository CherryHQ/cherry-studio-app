import { OFFICE_LINK_LIMIT, officeLinkTarget } from '../officeLinkPolicy';

it.each([
  'https://example.com/path?q=1',
  'http://example.com',
  'mailto:reader@example.com',
  'https://example.com/hello world',
  'mailto:reader@example.com?subject=Hello world',
])('allows an explicit external target: %s', (raw) => {
  expect(officeLinkTarget(raw)).toEqual({ kind: 'external', value: new URL(raw).href });
});

it.each([
  'javascript:alert(1)',
  'data:text/html,hello',
  'file:///private/a',
  'intent://open',
  '//example.com',
  '../document.docx',
  'https://user:pass@example.com',
  'java\nscript:alert(1)',
  'mailto:',
  '#%ZZ',
  `https://example.com/${'x'.repeat(OFFICE_LINK_LIMIT)}`,
])('rejects an unsupported or malformed target: %s', (raw) => {
  expect(officeLinkTarget(raw)).toBeNull();
});

it('decodes a document bookmark without interpreting it as a selector or URL', () => {
  expect(officeLinkTarget('#chapter%202%3A%5Bsummary%5D')).toEqual({
    kind: 'bookmark',
    value: 'chapter 2:[summary]',
  });
});
