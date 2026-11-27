import type { CherryMessagePart } from '@/shared/data/types/message';

import {
  hasSpeakableAssistantMessageText,
  speechAssistantMessageText,
} from '../speechAssistantMessageText';

const text = (value: string): CherryMessagePart => ({ type: 'text', text: value });
const image = {
  type: 'file',
  mediaType: 'image/png',
  url: 'file:///generated.png',
  providerMetadata: { cherry: { fileEntryId: 'managed-image' } },
} satisfies CherryMessagePart;
const tool = {
  type: 'tool-web_search',
  toolCallId: 'search',
  state: 'output-available',
  input: { query: 'search' },
  output: [{ id: 'search-result', url: 'https://example.com', title: 'Search result' }],
} satisfies CherryMessagePart;

test('speaks only the rendered answer and resolves citations across all message parts', () => {
  expect(
    speechAssistantMessageText(
      [
        { type: 'reasoning', text: 'Private reasoning' },
        text('Looking up [cite:persisted-source].'),
        tool,
        image,
        text('**Answer** [cite:search-result] and details [cite:persisted-source].'),
        text('![duplicate](https://example.com/managed-image)'),
      ],
      [{ id: 'persisted-source', title: 'Prior source' }],
    ),
  ).toBe('Answer and details.');
});

test('image-only, process-only and silent answers have no speech text', () => {
  expect(speechAssistantMessageText([image, text('![duplicate](/managed-image)')])).toBe('');
  expect(speechAssistantMessageText([text('Searching…'), tool])).toBe('');
  expect(speechAssistantMessageText([text('```js\nconsole.log(1)\n```')])).toBe('');
  expect(speechAssistantMessageText([text('https://example.com')])).toBe('');
  expect(
    speechAssistantMessageText([text('[cite:source]')], [{ id: 'source', title: 'Source' }]),
  ).toBe('');
});

test('inline code that looks like Markdown survives the first speech projection', () => {
  expect(speechAssistantMessageText([text('`[label](target)` and `https://code.test`.')])).toBe(
    '[label](target) and https://code.test.',
  );
});

test.each<[string, CherryMessagePart[], boolean]>([
  ['plain prose', [text('Hello world.')], true],
  ['fenced code followed by prose', [text('```ts\nconst a = 1\n```\nDone.')], true],
  ['HTML comment block before prose', [text('<!--\ndraft\n-->\nVisible answer.')], true],
  ['link label only', [text('[Read docs](https://example.com)')], true],
  ['inline code only', [text('`npm test`')], true],
  ['image only', [image, text('![duplicate](/managed-image)')], false],
  ['indented code only', [text('    const a = 1')], false],
  ['fenced code only', [text('```js\nconsole.log(1)\n```')], false],
  ['bare URL only', [text('https://example.com')], false],
  ['HTML comment only', [text('<!--\nignored prose\n-->')], false],
  ['formula block only', [text('$$\nx = 1\n$$')], false],
  ['confirmed citation only', [tool, text('[cite:search-result]')], false],
  ['unknown citation preserved', [text('[cite:unknown]')], true],
])('availability check matches extracted speech in %s', (_name, parts, expected) => {
  const full = Boolean(speechAssistantMessageText(parts));
  expect(full).toBe(expected);
  expect(hasSpeakableAssistantMessageText(parts)).toBe(expected);
});
