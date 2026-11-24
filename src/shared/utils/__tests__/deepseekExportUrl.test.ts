import { parseDeepseekExportUrl } from '../deepseekExportUrl';

const origin = 'https://deepseek-chat-history-exports-prod.obs.cn-east-3.myhuaweicloud.com';
// Synthetic capability, never a user's live export link.
const url = `${origin}/00000000-0000-4000-8000-000000000001.zip?response-content-disposition=attachment%3B%20filename%3Ddeepseek_data-2026-11-17.zip&Expires=4102444800&AccessKeyId=EXAMPLE&Signature=abc%2B123%2F%3D`;

test('preserves the exact signed query, trimming only surrounding whitespace', () => {
  expect(parseDeepseekExportUrl(`  ${url}\n`, 0)).toBe(url);
});

test.each([
  url.replace(origin, 'https://deepseek-exports.oss-cn-hangzhou.aliyuncs.com'),
  url.replace(origin, 'https://download.deepseek.com'),
  url.replace('.zip?', '.bin?'),
  url.replace('&Signature=abc%2B123%2F%3D', ''),
  `${url}&extra=1#export`,
])('admits a changed DeepSeek export location or query shape %s', (input) => {
  expect(parseDeepseekExportUrl(input, 0)).toBe(input);
});

test.each([
  'not a link',
  url.replace('https:', 'http:'),
  url.replace(origin, 'https://example.com'),
  url.replace('https://', 'https://user:password@'),
])('rejects a link that is not an HTTPS DeepSeek link: %s', (input) => {
  expect(() => parseDeepseekExportUrl(input, 0)).toThrow('DeepSeek import: invalid-link');
});

test.each(['/share', '/share/example'])('recognizes the DeepSeek chat share route %s', (path) => {
  expect(() => parseDeepseekExportUrl(`https://chat.deepseek.com${path}`, 0)).toThrow(
    'DeepSeek import: share-link',
  );
});

test('rejects expiration at the boundary and ignores a non-numeric expiry', () => {
  expect(() => parseDeepseekExportUrl(url, 4102444800 * 1000)).toThrow(
    'DeepSeek import: expired-link',
  );
  const unknown = url.replace('Expires=4102444800', 'Expires=later');
  expect(parseDeepseekExportUrl(unknown, 4102444800 * 1000)).toBe(unknown);
});
