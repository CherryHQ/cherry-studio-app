import type { MessageListItem } from '@/frontend/components/Message';
import { withCherryMeta } from '@/shared/data/types/uiParts';

import { messageTranslationSource } from '../messageTranslationSource';

const message: MessageListItem = {
  id: 'answer',
  role: 'assistant',
  status: 'success',
  data: {
    parts: [
      { type: 'reasoning', text: 'Private thought' },
      { type: 'text', text: '# Answer' },
      { type: 'data-code', data: { content: 'run()', language: 'js' } },
      { type: 'data-translation', data: { content: 'Old translation', targetLanguage: 'fr-FR' } },
      { type: 'data-error', data: { message: 'Diagnostic' } },
      {
        type: 'dynamic-tool',
        toolName: 'search',
        toolCallId: 'call',
        state: 'output-available',
        input: {},
        output: 'Tool result',
      },
    ],
  },
};

test('extracts original answer Markdown and code without reasoning, tool results or old translations', () => {
  const before = JSON.stringify(message);
  expect(messageTranslationSource(message)?.text).toBe('# Answer\n\n```js\nrun()\n```');
  expect(JSON.stringify(message)).toBe(before);
});

test('enables only successful assistant messages with answer text', () => {
  expect(messageTranslationSource({ ...message, role: 'user' })).toBeUndefined();
  for (const status of ['pending', 'error', 'paused'] as const) {
    expect(messageTranslationSource({ ...message, status })).toBeUndefined();
  }
  expect(
    messageTranslationSource({
      ...message,
      data: { parts: [{ type: 'reasoning', text: 'Thought' }] },
    }),
  ).toBeUndefined();
});

test('changes the source hash when the answer changes but not when metadata changes', () => {
  const original = messageTranslationSource(message);
  expect(messageTranslationSource({ ...message, createdAt: 'new-time' })?.contentHash).toBe(
    original?.contentHash,
  );
  expect(
    messageTranslationSource({
      ...message,
      data: { parts: [{ type: 'text', text: 'Edited answer' }] },
    })?.contentHash,
  ).not.toBe(original?.contentHash);
});

test('quote accessories cannot change original translation text or hash', () => {
  const plain: MessageListItem = {
    ...message,
    data: { parts: [{ type: 'text', text: '# Original' }] },
  };
  const quoted: MessageListItem = {
    ...plain,
    data: {
      parts: [
        withCherryMeta(
          { type: 'text', text: '# Original' },
          {
            quotes: [
              {
                id: 'q',
                sourceMessageId: '00000000-0000-7000-8000-000000000001',
                text: 'Other source words',
              },
            ],
            quoteAuthor: { role: 'assistant' },
          },
        ),
      ],
    },
  };
  expect(messageTranslationSource(quoted)).toEqual(messageTranslationSource(plain));
});
