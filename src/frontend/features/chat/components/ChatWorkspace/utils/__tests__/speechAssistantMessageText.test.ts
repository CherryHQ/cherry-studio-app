import type { CherryMessagePart } from '@/shared/data/types/message';

import { speechAssistantMessageText } from '../speechAssistantMessageText';

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
