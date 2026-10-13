import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

import { createExtractionCode } from '../createExtractionCode';
import coreJs from '../vendor/core-js-bundle.json';
import linkedom from '../vendor/linkedom.json';
import readability from '../vendor/mozilla-readability.json';
import gfm from '../vendor/turndown-plugin-gfm.json';
import turndown from '../vendor/turndown.json';

// Protect the JavaScript adapter without pretending Node proves native QuickJS compatibility.
async function extract(html: string, url = 'https://example.com/articles/current') {
  const code = `(async function () { ${createExtractionCode(html, url)}\n})()`;
  return new Script(code).runInNewContext({}, { timeout: 5_000 }) as Promise<{
    status: string;
    title?: string;
    content?: string;
    truncated?: boolean;
  }>;
}

const paragraph =
  'This article explains how local reading works. The application downloads a document and extracts the main content on the device, keeping its headings, links and examples. ';
function article(content: string) {
  return `<html><head><title>Local reading</title></head><body><nav>Menu</nav><article><h1>Local reading</h1>${content}</article><footer>Footer</footer></body></html>`;
}

test('keeps source assets unchanged and includes their license notices', () => {
  for (const asset of [coreJs, linkedom, readability, turndown, gfm]) {
    expect(createHash('sha256').update(asset.code).digest('hex')).toBe(asset.sha256);
    expect(asset.license).toMatch(/Copyright|copyright/i);
  }
});

test('extracts article text and resolves links against the document base', async () => {
  const html = article(
    `<p>${paragraph.repeat(6)}<a href="../guide?q=1#part">Guide</a></p>`,
  ).replace('</head>', '<base href="/docs/sub/"></head>');
  const result = await extract(html);
  expect(result.status).toBe('ok');
  expect(result.content).toContain('https://example.com/docs/guide?q=1#part');
  expect(result.content).not.toContain('Menu');
  expect(result.content).not.toContain('Footer');
});

test('preserves code blocks and table values in Markdown', async () => {
  const result = await extract(
    article(
      `<p>${paragraph.repeat(6)}</p><pre><code>const answer = 42;</code></pre><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Example</td><td>42</td></tr></tbody></table>`,
    ),
  );
  expect(result.content).toContain('```');
  expect(result.content).toContain('const answer = 42;');
  expect(result.content).toContain('| Name | Value |');
  expect(result.content).toContain('| Example | 42 |');
});

test('bounds native output before serialization and marks the missing tail', async () => {
  const result = await extract(article(`<p>${paragraph.repeat(200)}</p>`));
  expect(result.content).toHaveLength(24_000);
  expect(result.truncated).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(256 * 1024);
});

test('treats scripts and source-like text as data', async () => {
  const result = await extract(
    article(
      `<p>${paragraph.repeat(6)}</p><script>throw new Error('page script executed');</script><p>"; throw new Error('input executed'); //</p>`,
    ),
  );
  expect(result.status).toBe('ok');
  expect(result.content).not.toContain('page script executed');
});

test('reports pages with no body content as empty', async () => {
  await expect(
    extract('<html><head><title>Empty</title></head><body></body></html>'),
  ).resolves.toMatchObject({ status: 'empty' });
});
