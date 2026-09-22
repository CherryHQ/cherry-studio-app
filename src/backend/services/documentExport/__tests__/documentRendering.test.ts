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
      '<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$x^2$ \\(y_1\\) \\[1\\]',
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
  expect(result.html.match(/<math/g)).toHaveLength(2);
  expect(result.html).toContain('[1]');
  expect(result.html).not.toContain('<script src=');
  expect(result.issues).toEqual([]);
});

test('image and HTML exports include one brand signature after the complete content', async () => {
  const document = normalizeDocument({ kind: 'markdown', source: 'Complete answer.' });
  const signature = {
    background: '#ffffff',
    foreground: '#000000',
    brandName: 'Cherry Studio <brand>',
    timestamp: '2026.09.16 18:00',
    logoDataUrl: 'data:image/png;base64,AA==',
  };
  for (const imageFrame of [undefined, { background: '#eeeeee', label: 'Conversation' }]) {
    const { html } = await renderHtml(
      document,
      { ...presentation, watermark: { kind: 'cherry', signature }, imageFrame },
      new Map(),
      jest.fn(),
      new AbortController().signal,
    );
    expect(html.match(/<footer\b/g)).toHaveLength(1);
    const footer = html.slice(html.indexOf('<footer'));
    expect(footer).toContain('Cherry Studio &lt;brand&gt;');
    expect(footer).toContain(signature.timestamp);
    expect(footer).not.toContain('<brand>');
    expect(footer).not.toContain('AI-generated');
    expect(html.indexOf('Complete answer.')).toBeLessThan(html.indexOf('<footer'));
  }
});

test('rejects invalid signature colors and missing timestamp instead of rendering unsafe markup', async () => {
  const document = normalizeDocument({ kind: 'markdown', source: 'Answer.' });
  const signature = {
    background: '#ffffff',
    foreground: '#000000',
    brandName: 'Cherry Studio',
    timestamp: '2026.09.16 18:00',
    logoDataUrl: 'data:image/png;base64,AA==',
  };
  for (const invalid of [
    { ...signature, background: 'white;position:fixed' },
    { ...signature, timestamp: undefined },
  ]) {
    await expect(
      renderHtml(
        document,
        { ...presentation, watermark: { kind: 'cherry', signature: invalid as typeof signature } },
        new Map(),
        jest.fn(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  }
});

test('none removes the footer from HTML and image documents without removing content', async () => {
  const document = normalizeDocument({ kind: 'markdown', source: 'Complete answer.' });
  for (const imageFrame of [undefined, { background: '#eeeeee', label: 'Conversation' }]) {
    const { html } = await renderHtml(
      document,
      {
        ...presentation,
        watermark: { kind: 'none' },
        imageFrame,
      },
      new Map(),
      jest.fn(),
      new AbortController().signal,
    );
    expect(html).toContain('Complete answer.');
    expect(html).not.toContain('<footer');
    expect(html).not.toContain('print-signature');
  }
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

test('more than 32 image sources remain in the complete HTML export', async () => {
  const document = normalizeDocument({
    kind: 'document',
    document: {
      sections: [
        {
          id: 'selection',
          blocks: [
            { kind: 'text', text: 'All selected message text.' },
            ...Array.from({ length: 33 }, (_, index) => ({
              kind: 'image' as const,
              assetId: `image-${index}`,
              alt: `Photo ${index}`,
            })),
          ],
        },
      ],
      assets: Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [
          `image-${index}`,
          {
            kind: 'managed-file' as const,
            fileEntryId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          },
        ]),
      ),
    },
  });
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
    ),
    (character) => character.charCodeAt(0),
  );
  const read = jest.fn(async () => png);
  const { html, issues } = await renderHtml(
    document,
    presentation,
    new Map(),
    read,
    new AbortController().signal,
  );
  expect(issues).toEqual([]);
  expect(html.match(/<img src="data:image\/png;base64,/g)).toHaveLength(33);
  expect(html).toContain('alt="Photo 32"');
  expect(read).toHaveBeenCalledTimes(33);
  const markdown = renderMarkdown(document);
  expect(markdown).toContain('All selected message text\\.');
  expect(markdown).toContain('Photo 32');
});

test('repeated embedded images do not impose an output text budget', async () => {
  const document = normalizeDocument({
    kind: 'markdown',
    source: Array.from(
      { length: 25 },
      (_, index) => `![Photo ${index}](https://example.com/image.png)`,
    ).join('\n\n'),
  });
  const dataUrl = `data:image/png;base64,${'A'.repeat(1024 * 1024)}`;
  const cache = new Map([['https://example.com/image.png', { dataUrl }]]);
  const { html, issues } = await renderHtml(
    document,
    presentation,
    cache,
    jest.fn(),
    new AbortController().signal,
  );
  expect(issues).toEqual([]);
  expect(html.length).toBeGreaterThan(24 * 1024 * 1024);
  expect(html.match(/<img src="data:image\/png;base64,/g)).toHaveLength(25);
  expect(html).toContain('alt="Photo 24"');
});
