import { AiContentLabelSchema } from '@/shared/data/types/aiContent';
import { GENERATED_FILE_AUTHOR } from '@/shared/data/types/file';

import {
  aiContentMarkdownBody,
  readAiContentHtml,
  readAiContentText,
  writeAiContentText,
} from '../aiContentText';

const label = AiContentLabelSchema.parse({
  Label: '1',
  ContentProducer: 'ProviderExample',
  ProduceID: 'content-1',
  ReservedCode1: '',
  ContentPropagator: 'RelayExample',
  PropagateID: 'relay-1',
  ReservedCode2: '',
});
const edited = { ...label, ProduceID: 'content-2', PropagateID: 'relay-2' };
const generatedAuthor = { name: GENERATED_FILE_AUTHOR, replace: true };
const editAuthor = { name: GENERATED_FILE_AUTHOR, replace: false };

test('clears only superseded AIGC declarations, keeping content and unrelated metadata', () => {
  const source = '\uFEFF---\ntitle: Report\n---\nBody\r\n';
  const markdown = writeAiContentText(source, 'text/markdown', label);
  const cleared = writeAiContentText(markdown, 'text/markdown', null);
  expect(cleared).toBe(source);
  expect(readAiContentText(cleared, 'text/markdown')).toBeNull();
  const html =
    '<!DOCTYPE html><html><head><meta name="author" content="Original"></head><body>Body</body></html>';
  expect(writeAiContentText(writeAiContentText(html, 'text/html', label), 'text/html', null)).toBe(
    html,
  );
  expect(writeAiContentText('Plain body\n', 'text/markdown', null)).toBe('Plain body\n');
  expect(writeAiContentText('<main>Body</main>', 'text/html', null)).toBe('<main>Body</main>');
});

test('merges Markdown metadata, preserves BOM/body and omits only AIGC from reading', () => {
  const source = '\uFEFF---\r\ntitle: Report\r\n---\r\n# 原文 😀\r\n\r\nBody\r\n';
  const stored = writeAiContentText(source, 'text/markdown', label);
  expect(stored.startsWith('\uFEFF---\n')).toBe(true);
  expect(stored.endsWith('# 原文 😀\r\n\r\nBody\r\n')).toBe(true);
  expect(readAiContentText(stored, 'text/markdown')).toEqual(label);
  expect(aiContentMarkdownBody(stored)).toContain('title: Report');
  expect(aiContentMarkdownBody(stored)).not.toContain('ContentProducer');
  const rewritten = writeAiContentText(stored, 'text/markdown', edited);
  expect(rewritten.match(/^AIGC:/gm)).toHaveLength(1);
  expect(readAiContentText(rewritten, 'text/markdown')).toEqual(edited);
  expect(aiContentMarkdownBody(writeAiContentText('Only body\n', 'text/markdown', label))).toBe(
    'Only body\n',
  );
});

test('does not treat examples as declarations or inject over ambiguous/oversized headers', () => {
  expect(readAiContentText('Example:\n```yaml\nAIGC: {}\n```', 'text/markdown')).toBeNull();
  expect(() =>
    writeAiContentText('---\nAIGC: {}\nAIGC: {}\n---\nBody', 'text/markdown', label),
  ).toThrow();
  expect(() =>
    writeAiContentText(
      '---\ntitle: ' + 'x'.repeat(256 * 1024) + '\n---\nBody',
      'text/markdown',
      label,
    ),
  ).toThrow();
});

test('normalizes the generated Markdown author without changing body or unrelated metadata', () => {
  const source = '\uFEFF---\r\nauthor: Model\r\ntitle: Report\r\n---\r\n# 原文 😀\r\nBody\r\n';
  const stored = writeAiContentText(source, 'text/markdown', label, generatedAuthor);
  expect(stored.endsWith('# 原文 😀\r\nBody\r\n')).toBe(true);
  expect(stored).toContain('author: Cherry Studio\n');
  expect(stored).toContain('title: Report\n');
  expect(aiContentMarkdownBody(stored)).toBe(
    '\uFEFF---\ntitle: Report\n---\n# 原文 😀\r\nBody\r\n',
  );
  const rewritten = writeAiContentText(stored, 'text/markdown', edited, generatedAuthor);
  expect(rewritten.match(/^author:/gm)).toHaveLength(1);
  expect(readAiContentText(rewritten, 'text/markdown')).toEqual(edited);
  expect(aiContentMarkdownBody(writeAiContentText(source, 'text/markdown', label))).toContain(
    'author: Model',
  );
  expect(
    aiContentMarkdownBody(
      writeAiContentText('Only body\n', 'text/markdown', label, generatedAuthor),
    ),
  ).toBe('Only body\n');
});

test('replaces real HTML author tags while preserving examples and other head/body content', () => {
  const content =
    '<script>const sample = "<meta name=author content=Example>";</script>' +
    '<template><meta name="author" content="Template"></template>' +
    '<meta name="description" content="Keep"></head><body>原文 😀</body></html>';
  const source =
    '<!DOCTYPE html><html><head><meta name="author" content="Model">' +
    '<META NAME="Author" content="Other">' +
    content;
  const stored = writeAiContentText(source, 'text/html', label, generatedAuthor);
  expect(stored.match(/<meta name="author" content="Cherry Studio">/g)).toHaveLength(1);
  expect(stored).not.toContain('content="Model"');
  expect(stored).not.toContain('content="Other"');
  expect(stored.endsWith(content)).toBe(true);
  const rewritten = writeAiContentText(stored, 'text/html', edited, generatedAuthor);
  expect(rewritten.match(/<meta name="author" content="Cherry Studio">/g)).toHaveLength(1);
  expect(readAiContentText(rewritten, 'text/html')).toEqual(edited);
});

test('writes one real HTML head property without changing scripts, styles or body', () => {
  const body = '<body><p>原文 😀 &amp; body</p></body></html>';
  const source =
    '<!DOCTYPE html><html><!-- <head><meta name="AIGC" content="bad"></head> -->' +
    "<head><script>const sample = \"<head><meta name='AIGC' content='bad'></head>\";</script>" +
    '<style>p:before{content:"<meta name=AIGC>"}</style>' +
    '<template><head><meta name="AIGC" content="bad"></head></template></head>' +
    body;
  const stored = writeAiContentText(source, 'text/html', label);
  expect(stored).toContain('<head><meta name="AIGC" content="{&quot;Label&quot;:');
  expect(stored).toContain(
    source.slice(source.indexOf('<script>'), source.indexOf('</head><body>')),
  );
  expect(stored.endsWith(body)).toBe(true);
  expect(readAiContentText(stored, 'text/html')).toEqual(label);
  const updated = writeAiContentText(stored, 'text/html', edited);
  expect(readAiContentText(updated, 'text/html')).toEqual(edited);
  expect(updated).not.toContain('content-1');
});

test('preserves fragments and refuses conflicting declarations', () => {
  const stored = writeAiContentText('<main>Body</main>', 'text/html', label);
  expect(stored.endsWith('<main>Body</main>')).toBe(true);
  expect(readAiContentText(stored, 'text/html')).toEqual(label);
  const another = writeAiContentText('<main>Body</main>', 'text/html', edited).match(
    /<meta[^>]+>/,
  )![0];
  expect(() =>
    readAiContentText(stored.replace('</head>', another + '</head>'), 'text/html'),
  ).toThrow();
  expect(() =>
    writeAiContentText('<html><head><title>incomplete</title>', 'text/html', label),
  ).toThrow();
});

test.each([1, 7, 64 * 1024])(
  'HTML carrier parsing survives %s-character chunk boundaries',
  (size) => {
    const source = writeAiContentText(
      '<!DOCTYPE html><!-- <head>fake</head> --><html><head>' +
        '<template><head><meta name="AIGC" content="bad"></head></template>' +
        '<script>const sample = "<head><meta name=AIGC content=bad></head>";</script>' +
        '<style>p:before{content:"<meta name=AIGC>"}</style></head>',
      'text/html',
      label,
    );
    function* chunks() {
      for (let offset = 0; offset < source.length; offset += size)
        yield source.slice(offset, offset + size);
      throw new Error('The document body must not be read');
    }
    expect(readAiContentHtml(chunks())).toEqual(label);
  },
);

test('scans past a large script but still rejects a conflicting declaration at the end of head', () => {
  const first = writeAiContentText('<head></head>', 'text/html', label).match(/<meta[^>]+>/)![0];
  const second = writeAiContentText('<head></head>', 'text/html', edited).match(/<meta[^>]+>/)![0];
  function* chunks() {
    yield '<html><head>' + first + '<script>';
    for (let index = 0; index < 8; index++) yield 'x'.repeat(64 * 1024);
    yield '</scr';
    yield 'ipt>' + second + '</head></html>';
  }
  expect(() => readAiContentHtml(chunks())).toThrow('Conflicting AIGC HTML metadata');
  expect(() =>
    readAiContentHtml(['<head><meta name="AIGC" content="', 'x'.repeat(256 * 1024), '"></head>']),
  ).toThrow('Oversized HTML metadata');
});

test('an AI edit keeps an existing author and adds the application author only when missing', () => {
  const markdown = '---\nauthor: 张三\ntitle: Report\n---\nBody\n';
  const storedMarkdown = writeAiContentText(markdown, 'text/markdown', label, editAuthor);
  expect(storedMarkdown).toContain('author: 张三\n');
  expect(storedMarkdown).not.toContain(GENERATED_FILE_AUTHOR);
  expect(writeAiContentText('Body\n', 'text/markdown', label, editAuthor)).toContain(
    'author: Cherry Studio\n',
  );
  const html = '<html><head><meta name="author" content="张三"></head><body>Body</body></html>';
  const storedHtml = writeAiContentText(html, 'text/html', label, editAuthor);
  expect(storedHtml).toContain('<meta name="author" content="张三">');
  expect(storedHtml).not.toContain(GENERATED_FILE_AUTHOR);
  expect(readAiContentText(storedHtml, 'text/html')).toEqual(label);
  expect(
    writeAiContentText(
      '<html><head></head><body>Body</body></html>',
      'text/html',
      label,
      editAuthor,
    ),
  ).toContain('<meta name="author" content="Cherry Studio">');
});

test('treats the iOS Markdown type and parameterized types as Markdown carriers', () => {
  for (const mediaType of ['text/x-markdown', 'Text/Markdown; charset=utf-8']) {
    const stored = writeAiContentText('Body\n', mediaType, label);
    expect(stored.startsWith('---\n')).toBe(true);
    expect(readAiContentText(stored, mediaType)).toEqual(label);
  }
});

test('labels HTML whose head closes implicitly at the next body element', () => {
  for (const source of [
    '<!doctype html><html><head><title>Report</title><body>Body</body></html>',
    '<!doctype html><html><head><title>Report</title><p>Body</p></html>',
  ]) {
    const stored = writeAiContentText(source, 'text/html', label, generatedAuthor);
    expect(readAiContentText(stored, 'text/html')).toEqual(label);
    expect(readAiContentHtml([stored])).toEqual(label);
    expect(writeAiContentText(stored, 'text/html', null)).toBe(
      source.replace('<title>', '<meta name="author" content="Cherry Studio"><title>'),
    );
  }
  expect(
    readAiContentText('<head><title>R</title><body><meta name="AIGC" content="bad">', 'text/html'),
  ).toBeNull();
});

test('reports invalid Markdown front matter with an actionable error', () => {
  for (const source of [
    '---\ntitle: Q3 Report: Summary\n---\nBody\n',
    '---\ntags: a\ntags: b\n---\nBody\n',
  ])
    expect(() => writeAiContentText(source, 'text/markdown', label)).toThrow(
      /front matter is not valid YAML .*Quote values/,
    );
});
