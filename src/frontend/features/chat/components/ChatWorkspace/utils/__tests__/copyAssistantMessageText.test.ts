import type { CherryMessagePart } from '@/shared/data/types/message';

import { copyAssistantMessageText } from '../copyAssistantMessageText';

describe('copyAssistantMessageText', () => {
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
