import { DocumentExportError, type ExportDocument } from '@/shared/contracts/documentExport';

import { normalizeDocument } from '../normalizeDocument';
import { renderHtml } from '../renderHtml';
import { renderMarkdown } from '../renderMarkdown';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const presentation = {
  width: 360,
  typography: {
    base: { fontSize: 16, lineHeight: 24 },
    sm: { fontSize: 14, lineHeight: 20 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 26 },
  },
  colors: {
    background: '#ffffff',
    foreground: '#111111',
    muted: '#666666',
    border: '#cccccc',
    link: '#006600',
    tertiary: '#666666',
    subtleBorder: '#eeeeee',
    bubble: '#f0f0f0',
    secondary: '#f5f5f5',
    codeBlock: '#f5f5f5',
    inlineCode: '#eeeeee',
    inlineCodeForeground: '#111111',
  },
};

test('plain Markdown remains usable without chat, while the session owns its copied input', () => {
  const input = {
    kind: 'markdown' as const,
    source: '# Hello\n\n```js\nconst a = 1;\n```\n\n$x^2$',
  };
  const document = normalizeDocument(input);
  input.source = 'changed later';
  expect(renderMarkdown(document)).toBe('# Hello\n\n```js\nconst a = 1;\n```\n\n$x^2$\n');
});

test('bounds cyclic/deep input before recursive schema parsing', () => {
  const value: Record<string, unknown> = {};
  value.self = value;
  expect(() => normalizeDocument(value as never)).toThrow(DocumentExportError);
  expect(() => normalizeDocument({ kind: 'markdown', source: 'x'.repeat(500_001) })).toThrow(
    DocumentExportError,
  );
});

test('structured Markdown preserves included details and uses labels for managed images', () => {
  const document: ExportDocument = {
    title: 'A [title]',
    sections: [
      {
        id: 'one',
        heading: 'Answer',
        blocks: [
          { kind: 'image', assetId: 'image', alt: 'Local image' },
          {
            kind: 'details',
            summary: 'Process',
            blocks: [{ kind: 'markdown', source: 'All included words.' }],
          },
          {
            kind: 'attachment',
            name: 'report.pdf',
            mediaType: 'application/pdf',
            url: 'file:///private/report.pdf',
          },
        ],
      },
    ],
    assets: {
      image: { kind: 'managed-file', fileEntryId: '00000000-0000-4000-8000-000000000001' },
    },
  };
  const markdown = renderMarkdown(document);
  expect(markdown).toContain('# A \\[title\\]');
  expect(markdown).toContain('[Local image]');
  expect(markdown).toContain('All included words.');
  expect(markdown).toContain('<details>\n<summary>Process</summary>');
  expect(markdown).not.toContain('### Process');
  expect(markdown).toContain('report\\.pdf (application/pdf)');
  expect(markdown).not.toContain('file:///');
});

test('process and reasoning remain nested and initially collapsed without dropping their content', async () => {
  const document = normalizeDocument({
    kind: 'document',
    document: {
      sections: [
        {
          id: 'answer',
          presentation: 'message',
          blocks: [
            {
              kind: 'details',
              presentation: 'process',
              summary: 'Took 12s',
              blocks: [
                {
                  kind: 'details',
                  presentation: 'reasoning',
                  summary: 'Thought it through',
                  blocks: [{ kind: 'markdown', source: 'Included reasoning.' }],
                },
              ],
            },
            { kind: 'markdown', source: 'Final answer.' },
          ],
        },
      ],
    },
  });
  expect(Object.isFrozen(document.sections[0].blocks[0])).toBe(true);
  const { html } = await renderHtml(
    document,
    presentation,
    new Map(),
    jest.fn(),
    new AbortController().signal,
  );
  expect(html).toContain('<details class="process"><summary>Took 12s</summary>');
  expect(html).toContain('<details class="reasoning"><summary>Thought it through</summary>');
  expect(html).not.toMatch(/<details\b[^>]*\bopen\b/);
  expect(html).toContain('Included reasoning.');
  expect(html).toContain('Final answer.');
});

test('HTML escapes authored markup, rejects executable links, renders tables and MathML offline', async () => {
  const document = normalizeDocument({
    kind: 'markdown',
    title: '<script>title</script>',
    source:
      '<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$x^2$',
  });
  const result = await renderHtml(
    document,
    presentation,
    new Map(),
    jest.fn(),
    new AbortController().signal,
  );
  expect(result.html).not.toContain('<script>');
  expect(result.html).not.toContain('href="javascript:');
  expect(result.html).toContain('&lt;script&gt;');
  expect(result.html).toContain('<table>');
  expect(result.html).toContain('<math');
  expect(result.html).not.toContain('<script src=');
  expect(result.issues).toEqual([]);
});

test('missing resources stay retryable, while successful bytes are reused for later formats', async () => {
  const document: ExportDocument = {
    sections: [{ id: 'one', blocks: [{ kind: 'image', assetId: 'photo', alt: 'Photo' }] }],
    assets: {
      photo: { kind: 'managed-file', fileEntryId: '00000000-0000-4000-8000-000000000001' },
    },
  };
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
    ),
    (character) => character.charCodeAt(0),
  );
  const read = jest.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(png);
  const cache = new Map();
  const signal = new AbortController().signal;
  const missing = await renderHtml(document, presentation, cache, read, signal);
  expect(missing.html).toContain('[Photo]');
  expect(missing.issues).toEqual([{ code: 'image-unavailable', label: 'Image' }]);
  const first = await renderHtml(document, presentation, cache, read, signal);
  const next = await renderHtml(document, presentation, cache, read, signal);
  expect(first.html).toContain('src="data:image/png;base64,');
  expect(next.html).toEqual(first.html);
  expect(read).toHaveBeenCalledTimes(2);
});

test('Markdown image examples inside code never fetch resources', async () => {
  const { fetch } = jest.requireMock('expo/fetch');
  const document = normalizeDocument({
    kind: 'markdown',
    source:
      '```md\n![sample](https://example.com/image.png)\n```\n\n`![sample](https://example.com/inline.png)`',
  });
  await renderHtml(document, presentation, new Map(), jest.fn(), new AbortController().signal);
  expect(fetch).not.toHaveBeenCalled();
});
