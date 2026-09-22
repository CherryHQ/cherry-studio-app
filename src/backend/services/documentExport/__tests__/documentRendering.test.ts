import { DocumentExportError, type ExportDocument } from '@/shared/contracts/documentExport';

import { DEFAULT_CONTENT_LABELS } from '../contentPresentation';
import { normalizeDocument } from '../normalizeDocument';
import { renderHtml, renderMarkdownPreview } from '../renderHtml';
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
  expect(markdown).toContain('**Image** · Local image');
  expect(markdown).toContain('All included words.');
  expect(markdown).toContain('> **Process**');
  expect(markdown).not.toContain('<details>');
  expect(markdown).not.toContain('### Process');
  expect(markdown).toContain('**report\\.pdf** · PDF');
  expect(markdown).toContain('attachment not included');
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
  expect(missing.html).not.toContain('Photo');
  expect(missing.html).toContain('Image unavailable');
  expect(missing.issues).toEqual([{ code: 'image-unavailable', label: 'Image' }]);
  const first = await renderHtml(document, presentation, cache, read, signal);
  const next = await renderHtml(document, presentation, cache, read, signal);
  expect(first.html).not.toContain('Photo');
  expect(first.html).not.toContain('image-caption');
  expect(first.html).toContain('src="data:image/png;base64,');
  expect(next.html).toEqual(first.html);
  expect(read).toHaveBeenCalledTimes(2);
});

test('Markdown previews display embedded PNG/JPEG without captions and reject active data formats', () => {
  const html = renderMarkdownPreview(
    '![internal-name.png](data:image/png;base64,AA==)\n\n![internal-name.jpg](data:image/jpeg;base64,AQ==)\n\n![bad](data:image/svg+xml;base64,PHN2Zz4=)',
    presentation,
  );
  expect(html).toContain('src="data:image/png;base64,AA=="');
  expect(html).toContain('src="data:image/jpeg;base64,AQ=="');
  expect(html).not.toContain('internal-name');
  expect(html).not.toContain('src="data:image/svg');
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
  expect(html).not.toContain('Photo 32');
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
  expect(html).not.toContain('Photo 24');
});

test('chat exports keep user bubbles and answer rows while Markdown keeps portable role headings', async () => {
  const document: ExportDocument = {
    title: 'Export <review>',
    sections: [
      {
        id: 'one',
        heading: 'You',
        presentation: 'bubble',
        blocks: [{ kind: 'text', text: '# literal question' }],
      },
      {
        id: 'two',
        heading: 'Assistant',
        presentation: 'message',
        blocks: [{ kind: 'markdown', source: 'Complete answer.' }],
      },
    ],
  };
  const markdown = renderMarkdown(document);
  expect(markdown).toContain('## You');
  expect(markdown).toContain('## Assistant');
  expect(markdown).toContain('\\# literal question');
  for (const imageFrame of [undefined, { background: '#ffffff', label: 'Conversation' }]) {
    const { html } = await renderHtml(
      document,
      { ...presentation, imageFrame },
      new Map(),
      jest.fn(),
      new AbortController().signal,
    );
    expect(html).toContain('<title>Export &lt;review&gt;</title>');
    expect(html).not.toContain('<h1 class="document-title">');
    expect(html).toContain('<section class="bubble-row" aria-label="You">');
    expect(html).toContain('<h2 class="message-heading">Assistant</h2>');
    expect(html.indexOf('aria-label="You"')).toBeLessThan(html.indexOf('>Assistant</h2>'));
    expect(html).not.toContain('01 ·');
    expect(html).toContain('# literal question');
    expect(html).toContain('Complete answer.');
  }
});

test('images show labelled code previews alongside prose and inline code', async () => {
  const source = [
    'Before. Use `inlineValue`.',
    '```js\nconst onlyInCode = "__CODE_SOURCE__";\n```',
    '```mermaid\ngraph TD; __DIAGRAM_SOURCE__-->B\n```',
    '    __INDENTED_CODE__',
    'After.',
  ].join('\n\n');
  const document = normalizeDocument({
    kind: 'markdown',
    source,
    labels: { ...DEFAULT_CONTENT_LABELS, codeOmitted: '代码内容已省略' },
  });
  const { html } = await renderHtml(
    document,
    { ...presentation, imageFrame: { background: '#ffffff', label: 'Document' } },
    new Map(),
    jest.fn(),
    new AbortController().signal,
  );
  expect(html.match(/<div class="code-block">/g)).toHaveLength(3);
  expect(html).not.toContain('代码内容已省略');
  expect(html).toContain('<span>js</span>');
  expect(html).toContain('<span>mermaid</span>');
  expect(html).toContain('<code>inlineValue</code>');
  expect(html).toContain('Before.');
  expect(html).toContain('After.');
  expect(html).toContain('<pre><code>');
  const browser = await renderHtml(
    document,
    presentation,
    new Map(),
    jest.fn(),
    new AbortController().signal,
  );
  for (const code of ['__CODE_SOURCE__', '__DIAGRAM_SOURCE__', '__INDENTED_CODE__']) {
    expect(html).toContain(code);
    expect(browser.html).toContain(code);
    expect(renderMarkdown(document)).toContain(code);
  }
});

test('HTML code previews keep complete escaped source accessible in a fixed-height scroll viewport', async () => {
  const longCode = '<tag>'.repeat(5000);
  const document = normalizeDocument({
    kind: 'markdown',
    source: `\`\`\`js\nconst message = "<script>";\n\`\`\`\n\n\`\`\`mermaid\ngraph TD; A-->B\n\`\`\`\n\n\`\`\`js\n${longCode}\n\`\`\``,
  });
  const { html } = await renderHtml(
    document,
    presentation,
    new Map(),
    jest.fn(),
    new AbortController().signal,
  );
  expect(html).toContain('<span>js</span>');
  expect(html).toContain('<span>mermaid</span>');
  expect(html).toContain('const message = &quot;&lt;script&gt;&quot;;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('graph TD; A--&gt;B');
  expect(html).toContain('&lt;tag&gt;'.repeat(5000));
  expect(html).toContain('height:192px');
  expect(html).toContain('.code-block pre{flex:1;min-height:0;overflow:auto}');
  expect(html).toContain('<pre tabindex="0"><code>');
  expect(renderMarkdown(document)).toContain(longCode);
});

test('four-column tables retain their rows, headers, alignment and media in image and HTML exports', async () => {
  const source =
    '| Name | Link | Image | Note |\n| --- | :---: | --- | ---: |\n| Alpha | [Docs](https://example.com/docs) | ![Photo](https://example.com/photo.png) | **Keep me** |';
  const document = normalizeDocument({ kind: 'markdown', source });
  const cache = new Map([
    ['https://example.com/photo.png', { dataUrl: 'data:image/png;base64,AA==' }],
  ]);
  const read = jest.fn();
  const { html } = await renderHtml(
    document,
    { ...presentation, imageFrame: { background: '#ffffff', label: 'Document' } },
    cache,
    read,
    new AbortController().signal,
  );
  expect(html).toContain('<table>');
  expect(html.match(/<tr>/g)).toHaveLength(2);
  expect(html.match(/<th(?:\s[^>]*)?>/g)).toHaveLength(4);
  expect(html).toContain('<th style="text-align:center">Link</th>');
  expect(html).toContain('<th style="text-align:right">Note</th>');
  expect(html).not.toContain('table-record');
  for (const text of [
    'Name',
    'Link',
    'Image',
    'Note',
    'Alpha',
    '<strong>Keep me</strong>',
    'href="https://example.com/docs"',
    'src="data:image/png;base64,AA=="',
  ])
    expect(html).toContain(text);
  const browser = await renderHtml(
    document,
    presentation,
    cache,
    read,
    new AbortController().signal,
  );
  expect(browser.html).toContain('<table>');
  expect(browser.html).toContain('<th style="text-align:center">Link</th>');
  expect(browser.html).toContain('<th style="text-align:right">Note</th>');
  expect(browser.html).not.toContain('table-wide');
  expect(browser.html).not.toContain('data-label=');
  expect(renderMarkdown(document)).toBe(`${source}\n`);
  expect(read).not.toHaveBeenCalled();
});

test('Markdown preview keeps image references readable without image layout or loading', () => {
  const source = [
    '# Conversation',
    '![三国名将阵营图](https://example.com/missing.png)',
    'Explanation with **emphasis**.',
    '| 阵营 | 核心名将 | 标签 | 说明 |\n| - | - | - | - |\n| 蜀汉 | 关张赵马黄 | 五虎上将 | 完整内容 |',
    '```unknown\nconst answer = 42;\n```',
  ].join('\n\n');
  const html = renderMarkdownPreview(source, presentation);
  expect(html).not.toContain('<img');
  expect(html).toContain('href="https://example.com/missing.png"');
  expect(html).toContain('三国名将阵营图');
  expect(html).toContain('example.com');
  expect(html).not.toContain('Image unavailable');
  expect(html).toContain('<strong>emphasis</strong>');
  expect(html).toContain('<table>');
  expect(html).toContain('<th>核心名将</th>');
  expect(html).not.toContain('table-wide');
  expect(html).not.toContain('data-label=');
  expect(html).toContain('完整内容');
  expect(html).toContain('const answer = 42;');
});

test('localized resource fallbacks are frozen and never imply that a private attachment was embedded', async () => {
  const labels = { ...DEFAULT_CONTENT_LABELS, fileMetadataOnly: '仅包含文件信息', sources: '来源' };
  const document = normalizeDocument({
    kind: 'document',
    document: {
      labels,
      sections: [
        {
          id: 'one',
          blocks: [
            {
              kind: 'attachment',
              name: 'report.pdf',
              url: 'file:///private/report.pdf',
              mediaType: 'application/pdf',
            },
            {
              kind: 'links',
              summary: '1 个来源',
              items: [{ label: '1. Docs', url: 'https://example.com/docs' }],
            },
            {
              kind: 'markdown',
              source:
                'Cited [1](https://example.com/docs). Ordinary [Docs](https://example.com/docs) and [2](https://elsewhere.example/).',
            },
          ],
        },
      ],
    },
  });
  labels.fileMetadataOnly = 'Changed';
  const markdown = renderMarkdown(document);
  for (const imageFrame of [undefined, { background: '#ffffff', label: 'Document' }]) {
    const { html } = await renderHtml(
      document,
      { ...presentation, imageFrame },
      new Map(),
      jest.fn(),
      new AbortController().signal,
    );
    for (const value of [html, markdown]) {
      expect(value).toContain('仅包含文件信息');
      expect(value).toContain('来源');
      expect(value).toContain('PDF');
      expect(value).not.toContain('file:///');
      expect(value).not.toContain('Changed');
    }
    expect(html).toContain('<span>1 个来源</span>');
    expect(html.match(/<svg class="reference-icon"/g)).toHaveLength(1);
    expect(html).not.toContain('reference-icons');
    expect(html).not.toContain('reference-card');
    expect(html).not.toContain('1. Docs');
    expect(html).toContain('<a href="https://example.com/docs" class="citation-link">1</a>');
    expect(html).toContain('<a href="https://example.com/docs">Docs</a>');
    expect(html).toContain('<a href="https://elsewhere.example/">2</a>');
  }
  expect(Object.isFrozen(document.labels)).toBe(true);
  expect(() =>
    normalizeDocument({
      kind: 'markdown',
      source: 'Content',
      labels: { ...DEFAULT_CONTENT_LABELS, code: 'x'.repeat(257) },
    }),
  ).toThrow(DocumentExportError);
});
