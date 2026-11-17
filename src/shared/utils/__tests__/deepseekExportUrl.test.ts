import { parseDeepseekExportUrl } from '../deepseekExportUrl';

const origin = 'https://deepseek-chat-history-exports-prod.obs.cn-east-3.myhuaweicloud.com';
// Synthetic capability, never a user's live export link.
const url = `${origin}/00000000-0000-4000-8000-000000000001.zip?response-content-disposition=attachment%3B%20filename%3Ddeepseek_data-2026-11-17.zip&Expires=4102444800&AccessKeyId=EXAMPLE&Signature=abc%2B123%2F%3D`;

test('preserves the exact signed query, trimming only surrounding whitespace', () => {
  expect(parseDeepseekExportUrl(`  ${url}\n`, 0)).toBe(url);
});

test.each([
  url.replace('https:', 'http:'),
  url.replace(origin, `${origin}.example.com`),
  url.replace(origin, 'https://other-bucket.obs.cn-east-3.myhuaweicloud.com'),
  url.replace('https://', 'https://user:password@'),
  url.replace('.com/', '.com:8443/'),
  `${url}#export`,
  url.replace('.zip?', '.txt?'),
  url.replace('deepseek_data-', 'other_data-'),
  url.replace('&Signature=abc%2B123%2F%3D', ''),
  `${url}&Signature=another`,
  url.replace('Expires=4102444800', 'Expires=not-a-time'),
])('rejects an untrusted or malformed link without returning its capability', (input) => {
  expect(() => parseDeepseekExportUrl(input, 0)).toThrow('DeepSeek import: invalid-link');
});

test('rejects expiration at the boundary', () => {
  expect(() => parseDeepseekExportUrl(url, 4102444800 * 1000)).toThrow(
    'DeepSeek import: expired-link',
  );
});
