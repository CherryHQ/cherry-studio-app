import type { CherryMessagePart } from '@/shared/data/types/message';

import { copyAssistantMessageText } from '../copyAssistantMessageText';

describe('copyAssistantMessageText', () => {
  test('numbers citations in the order they occur across the complete message', () => {
    const parts = [
      { type: 'source-url', sourceId: 'a', url: 'https://a.example' },
      { type: 'source-url', sourceId: 'b', url: 'https://b.example' },
      { type: 'text', text: 'Process [cite:b]' },
      { type: 'text', text: 'Answer [cite:a]' },
    ] satisfies CherryMessagePart[];

    expect(copyAssistantMessageText(parts)).toBe('Process [1]\n\nAnswer [2]');
  });

  test('projects only visible copyable assistant content', () => {
    const parts = [
      { text: '  Answer  ', type: 'text' },
      {
        data: { content: 'const answer = 42', language: 'ts' },
        type: 'data-code',
      },
      {
        data: {
          compactedContent: 'HIDDEN ORIGINAL CONTEXT',
          content: 'Visible summary',
        },
        type: 'data-compact',
      },
      {
        data: { content: 'Translated answer', targetLanguage: 'en' },
        type: 'data-translation',
      },
      {
        data: { message: 'Request failed', name: 'NetworkError' },
        type: 'data-error',
      },
      { state: 'done', text: 'Private reasoning', type: 'reasoning' },
      {
        filename: 'photo.png',
        mediaType: 'image/png',
        type: 'file',
        url: 'file:///photo.png',
      },
      {
        input: {},
        output: 'Tool output',
        state: 'output-available',
        toolCallId: 'tool-1',
        type: 'tool-example',
      } as unknown as CherryMessagePart,
    ] satisfies CherryMessagePart[];

    expect(copyAssistantMessageText(parts)).toBe(
      [
        'Answer',
        '```ts\nconst answer = 42\n```',
        'Visible summary',
        'Translated answer',
        'Request failed',
      ].join('\n\n'),
    );
    expect(copyAssistantMessageText(parts)).not.toContain('HIDDEN ORIGINAL CONTEXT');
    expect(copyAssistantMessageText(parts)).not.toContain('Private reasoning');
    expect(copyAssistantMessageText(parts)).not.toContain('Tool output');
  });

  test('returns an empty string when no visible copyable content exists', () => {
    expect(copyAssistantMessageText([{ text: '   ', type: 'text' }])).toBe('');
  });
});

test('keeps code and non-text copy blocks literal while numbering the full message', () => {
  const parts = [
    { type: 'source-url', sourceId: 'a', url: 'https://a.example' },
    { type: 'source-url', sourceId: 'b', url: 'https://b.example' },
    { type: 'text', text: 'Process [cite:b]' },
    { type: 'reasoning', text: 'Hidden [cite:a]' },
    { type: 'text', text: 'Answer [cite:a]\n\n```md\n[cite:b]\n```' },
    { type: 'data-code', data: { content: '[cite:a]', language: 'md' } },
    { type: 'data-compact', data: { content: 'Compact [cite:b]', compactedContent: '' } },
    { type: 'data-translation', data: { content: 'Translation [cite:a]', targetLanguage: 'en' } },
    { type: 'data-error', data: { message: 'Error [cite:b]', name: 'Error' } },
  ] satisfies CherryMessagePart[];
  expect(copyAssistantMessageText(parts)).toBe(
    [
      'Process [1]',
      'Answer [2]\n\n```md\n[cite:b]\n```',
      '```md\n[cite:a]\n```',
      'Compact [cite:b]',
      'Translation [cite:a]',
      'Error [cite:b]',
    ].join('\n\n'),
  );
});
