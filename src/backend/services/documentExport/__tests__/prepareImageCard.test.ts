import MarkdownIt from 'markdown-it';

import type { ExportDocument, ExportPresentation } from '@/shared/contracts/documentExport';

import { prepareImageCard } from '../prepareImageCard';

const presentation = {
  width: 360,
  typography: {
    base: { fontSize: 16, lineHeight: 24 },
    sm: { fontSize: 14, lineHeight: 20 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 26 },
  },
} satisfies Pick<ExportPresentation, 'width' | 'typography'>;
const parser = new MarkdownIt();

function document(source: string): ExportDocument {
  return {
    sections: [{ id: 'answer', presentation: 'message', blocks: [{ kind: 'markdown', source }] }],
  };
}

test('an oversized code fence stays code, has a safe closing fence and leaves the source intact', () => {
  const source = `~~~~js\n${'const text = "```";\n'.repeat(400)}~~~~\n\nUnseen tail`;
  const input = document(source);
  const result = prepareImageCard(input, presentation);
  const block = result.document.sections[0].blocks[0];
  expect(result.isExcerpt).toBe(true);
  expect(block.kind).toBe('markdown');
  if (block.kind !== 'markdown') throw new Error('Expected fenced excerpt');
  const tokens = parser.parse(block.source, {});
  expect(tokens).toHaveLength(1);
  expect(tokens[0].type).toBe('fence');
  expect(tokens[0].content).toContain('const text = "```";');
  expect(tokens[0].content).not.toContain('…');
  expect(
    tokens[0].content
      .trimEnd()
      .split('\n')
      .every((line) => line === 'const text = "```";'),
  ).toBe(true);
  expect(block.source).toMatch(/\n`{4,}$/);
  expect(input.sections[0].blocks[0]).toEqual({ kind: 'markdown', source });
});

test('list excerpts retain complete items and never include a partially cut final link', () => {
  const items = Array.from(
    { length: 100 },
    (_, index) => `- Item ${index}: [Read more](https://example.com/${index})`,
  );
  const result = prepareImageCard(document(items.join('\n')), presentation);
  const block = result.document.sections[0].blocks[0];
  expect(result.isExcerpt).toBe(true);
  expect(block.kind).toBe('markdown');
  if (block.kind !== 'markdown') throw new Error('Expected list excerpt');
  const retained = block.source.split('\n');
  expect(retained.length).toBeGreaterThan(1);
  expect(retained).toEqual(items.slice(0, retained.length));
});

test('several answers share one larger budget instead of truncating each answer separately', () => {
  const short = document('简短的第一条回答');
  const answer = document('一段回答。'.repeat(500)).sections[0];
  const result = prepareImageCard(
    { sections: [short.sections[0], { ...answer, id: 'reply' }] },
    presentation,
  );
  expect(result.document.sections).toHaveLength(2);
  expect(result.document.sections[0].blocks).toEqual(short.sections[0].blocks);
  expect(result.document.sections[1].blocks.length).toBeGreaterThan(0);
  expect(result.maxHeight).toBeGreaterThan(prepareImageCard(short, presentation).maxHeight);
});

test('references defined after an omitted tail still work in the retained Markdown', () => {
  const source = `[Visible link][reference]\n\n${'Long paragraph. '.repeat(4000)}\n\n[reference]: https://example.com "Title"`;
  const result = prepareImageCard(document(source), presentation);
  const first = result.document.sections[0].blocks[0];
  expect(result.isExcerpt).toBe(true);
  if (first.kind !== 'markdown') throw new Error('Expected reference prefix');
  expect(parser.render(first.source)).toContain(
    '<a href="https://example.com" title="Title">Visible link</a>',
  );
});

test('a question and one answer keep the single-answer budget', () => {
  const answer = document('A short answer.');
  const question = {
    ...document('A question.').sections[0],
    id: 'question',
    presentation: 'bubble' as const,
  };
  const result = prepareImageCard({ sections: [question, ...answer.sections] }, presentation);
  expect(result.maxHeight).toBe(prepareImageCard(answer, presentation).maxHeight);
  expect(result.maxHeight).toBe(1950);
});

test('a long plain paragraph ends at a sentence without baking an omission marker into the source', () => {
  const text = '这是一句需要完整保留的正文。'.repeat(300);
  const input: ExportDocument = {
    sections: [{ id: 'answer', presentation: 'message', blocks: [{ kind: 'text', text }] }],
  };
  const result = prepareImageCard(input, presentation);
  const block = result.document.sections[0].blocks[0];
  if (block.kind !== 'text') throw new Error('Expected plain text');
  expect(result.isExcerpt).toBe(true);
  expect(text.startsWith(block.text)).toBe(true);
  expect(block.text).toMatch(/。$/);
  expect(block.text).not.toContain('…');
  expect(input.sections[0].blocks[0]).toEqual({ kind: 'text', text });
});

test('table excerpts keep the header separator and complete rows', () => {
  const rows = Array.from(
    { length: 100 },
    (_, index) => `| Row ${index} | [Read](https://example.com/${index}) |`,
  );
  const source = ['| Item | Link |', '| --- | --- |', ...rows].join('\n');
  const result = prepareImageCard(document(source), presentation);
  const block = result.document.sections[0].blocks[0];
  if (block.kind !== 'markdown') throw new Error('Expected table Markdown');
  expect(result.isExcerpt).toBe(true);
  expect(parser.render(block.source)).toContain('<table>');
  const retained = block.source.split('\n').slice(2);
  expect(retained.length).toBeGreaterThan(0);
  expect(retained).toEqual(rows.slice(0, retained.length));
});

test('a code block is omitted when the remaining budget cannot show any code', () => {
  const text = 'Line\n'.repeat(51);
  const result = prepareImageCard(
    {
      sections: [
        {
          id: 'answer',
          presentation: 'message',
          blocks: [
            { kind: 'text', text },
            { kind: 'markdown', source: '```js\n' + 'const value = 1;\n'.repeat(100) + '```' },
          ],
        },
      ],
    },
    presentation,
  );
  expect(result.isExcerpt).toBe(true);
  expect(result.document.sections[0].blocks).toEqual([{ kind: 'text', text }]);
});
