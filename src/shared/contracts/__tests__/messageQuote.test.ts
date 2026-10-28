import { AgentMessageViewSchema, messageQuoteSnapshot } from '../agent';

const source = () =>
  AgentMessageViewSchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    sessionId: 's',
    turnId: 't',
    role: 'assistant',
    status: 'success',
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    parts: [
      { id: 'r', type: 'reasoning', text: 'Private thought', state: 'done' },
      { id: 'p', type: 'text', text: '# Original\n```ts\ncomplete()\n```\n', state: 'done' },
      {
        id: 'f',
        type: 'file',
        fileEntryId: 'file',
        mediaType: 'image/png',
        filename: 'diagram.png',
        purpose: 'artifact',
      },
      { id: 's', type: 'data-search-suggestions', data: { html: 'Generated suggestions' } },
      {
        id: 'e',
        type: 'data-error',
        data: { code: 'INTERRUPTED', message: 'Diagnostic', retryable: true },
      },
    ],
    translations: {
      sourceHash: 'a'.repeat(64),
      results: { 'fr-FR': { content: 'Translated panel', createdAt: 1 } },
    },
  });
test('snapshot preserves complete Markdown/code and readable attachment descriptors, excluding reading aids and errors', () => {
  expect(messageQuoteSnapshot(source())).toBe(
    '# Original\n```ts\ncomplete()\n```\n\n\n[diagram.png (image/png)]',
  );
});
test.each(['pending', 'streaming', 'error', 'cancelled', 'interrupted'] as const)(
  'a %s assistant is ineligible',
  (status) => {
    expect(messageQuoteSnapshot({ ...source(), status })).toBeUndefined();
  },
);
test('system, unreadable and partial sources are ineligible, while a user never expands its nested quote', () => {
  expect(messageQuoteSnapshot({ ...source(), role: 'system' })).toBeUndefined();
  const partial = source();
  partial.parts.push({ id: 'partial', type: 'text', text: 'unfinished', state: 'streaming' });
  expect(messageQuoteSnapshot(partial)).toBeUndefined();
  const unreadable = source();
  unreadable.parts.push({
    id: 'bad',
    type: 'data-error',
    data: { code: 'MESSAGE_UNREADABLE', message: 'unsupported', retryable: false },
  });
  expect(messageQuoteSnapshot(unreadable)).toBeUndefined();
  const user = source();
  user.role = 'user';
  user.parts = [
    {
      id: 'p',
      type: 'text',
      state: 'done',
      text: 'My own request',
      quotes: [{ id: 'nested', sourceMessageId: user.id, text: 'Do not recurse' }],
      quoteAuthor: { role: 'assistant' },
    },
  ];
  expect(messageQuoteSnapshot(user)).toBe('My own request');
});
