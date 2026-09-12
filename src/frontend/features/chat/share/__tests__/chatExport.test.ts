import type { AgentMessageView } from '@/shared/contracts/agent';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import { loadChatExportMessages } from '../loadChatExportMessages';
import {
  replaceChatCitations,
  toChatExportDocument,
  type ChatExportOptions,
} from '../toChatExportDocument';

const options: ChatExportOptions = {
  title: 'Conversation',
  includeProcess: false,
  labels: {
    user: 'You',
    assistant: 'Assistant',
    process: (seconds) => `Took ${seconds}s`,
    reasoning: 'Reasoning',
    file: 'File',
    status: 'Status',
    messageStatuses: {
      pending: 'Pending',
      streaming: 'Streaming',
      success: 'Success',
      error: 'Failed',
      cancelled: 'Cancelled',
      interrupted: 'Interrupted',
    },
  },
};
function message(
  id: string,
  role: 'user' | 'assistant',
  parts: AgentMessageView['parts'],
): AgentMessageView {
  return {
    id,
    role,
    parts,
    sessionId: 'session',
    turnId: 'turn',
    status: 'success',
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    usage: null,
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}
const answer = message('b', 'assistant', [
  { id: 'early', type: 'text', text: 'Let me check.', state: 'done' },
  { id: 'reason', type: 'reasoning', text: 'Private reasoning', state: 'done' },
  { id: 'final', type: 'text', text: 'Final answer', state: 'done' },
  {
    id: 'file',
    type: 'file',
    fileEntryId: '00000000-0000-4000-8000-000000000001',
    mediaType: 'image/png',
    name: 'Photo',
    purpose: 'artifact',
  },
]);
const question = message('a', 'user', [
  { id: 'question', type: 'text', text: 'Question?', state: 'done' },
]);

test('disabling process includes the final answer and files but excludes earlier process text', () => {
  const document = toChatExportDocument([question, answer], options);
  expect(document.sections.map((section) => section.heading)).toEqual(['You', 'Assistant']);
  expect(document.sections[1].blocks).toEqual([
    { kind: 'markdown', source: 'Final answer' },
    { kind: 'image', assetId: 'b:file', alt: 'Photo' },
  ]);
  expect(JSON.stringify(document)).not.toContain('Private reasoning');
  expect(document.assets?.['b:file']).toEqual({
    kind: 'managed-file',
    fileEntryId: '00000000-0000-4000-8000-000000000001',
  });
});

test('process includes the visible reasoning and intermediate text without timestamps', () => {
  const document = toChatExportDocument([answer], {
    ...options,
    includeProcess: true,
  });
  expect(JSON.stringify(document)).toContain('Private reasoning');
  expect(JSON.stringify(document)).toContain('Let me check.');
  expect(document.sections[0].blocks[0]).toMatchObject({
    kind: 'details',
    presentation: 'process',
    summary: 'Took 1s',
    blocks: expect.arrayContaining([
      expect.objectContaining({ kind: 'details', presentation: 'reasoning', summary: 'Reasoning' }),
    ]),
  });
  expect(document.sections[0].metadata).toEqual([]);
});

test('reasoning after text is still process rather than a final answer', () => {
  const unfinishedAnswer = message('c', 'assistant', answer.parts.slice(0, 2));
  expect(toChatExportDocument([unfinishedAnswer], options).sections[0].blocks).toEqual([]);
});

test('exports only selected messages in reading order, not selection order', async () => {
  const laterAnswer = { ...answer, id: 'd', turnId: 'second-turn' };
  const laterQuestion = { ...question, id: 'c', turnId: 'second-turn' };
  const readPage = jest.fn(async () => ({ items: [laterAnswer, laterQuestion, answer, question] }));
  const messages = await loadChatExportMessages(
    ['d', 'a', 'd'],
    readPage,
    new AbortController().signal,
  );
  expect(messages).toEqual([question, laterAnswer]);
  expect(toChatExportDocument(messages, options).sections.map((section) => section.id)).toEqual([
    'a',
    'd',
  ]);
});

test('selecting an answer does not implicitly include its same-turn question', async () => {
  await expect(
    loadChatExportMessages(
      ['b'],
      async () => ({ items: [answer, question] }),
      new AbortController().signal,
    ),
  ).resolves.toEqual([answer]);
});

test('resolves selected IDs in one bounded read without scanning intervening history', async () => {
  const readPage = jest.fn(async () => ({ items: [answer, question] }));
  await expect(
    loadChatExportMessages(['b', 'a', 'b'], readPage, new AbortController().signal),
  ).resolves.toEqual([question, answer]);
  expect(readPage).toHaveBeenCalledTimes(1);
  expect(readPage).toHaveBeenCalledWith({ ids: ['b', 'a'] });
});

test.each(['pending', 'streaming'] as const)(
  'rejects a selected %s message instead of sharing a subset',
  async (status) => {
    await expect(
      loadChatExportMessages(
        ['a', 'b'],
        async () => ({ items: [{ ...answer, status }, question] }),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'unsettled' });
  },
);

test('rejects missing or system message selections', async () => {
  for (const items of [[answer], [answer, { ...question, role: 'system' as const }]]) {
    await expect(
      loadChatExportMessages(['a', 'b'], async () => ({ items }), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'missing' });
  }
});

test('rejects empty and oversized selections before loading history', async () => {
  const readPage = jest.fn();
  await expect(
    loadChatExportMessages([], readPage, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'empty' });
  await expect(
    loadChatExportMessages(
      Array.from({ length: DOCUMENT_EXPORT_MAX_SECTIONS + 1 }, (_, index) => String(index)),
      readPage,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'size-limit' });
  expect(readPage).not.toHaveBeenCalled();
});

test('admits the document selection limit without truncation', async () => {
  const history = Array.from({ length: DOCUMENT_EXPORT_MAX_SECTIONS }, (_, index) => ({
    ...question,
    id: `message-${index}`,
  }));
  const messages = await loadChatExportMessages(
    history.map((message) => message.id),
    async () => ({ items: history }),
    new AbortController().signal,
  );
  expect(messages).toEqual(history.toReversed());
  expect(toChatExportDocument(messages, options).sections).toHaveLength(history.length);
  expect(() => toChatExportDocument([...messages, answer], options)).toThrow('size-limit');
});

test('cancellation prevents starting the selected-ID read or using its result', async () => {
  const controller = new AbortController();
  const readPage = jest.fn(async () => {
    controller.abort();
    return { items: [answer, question] };
  });
  await expect(
    loadChatExportMessages(['a', 'b'], readPage, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(readPage).toHaveBeenCalledTimes(1);
  readPage.mockClear();
  await expect(
    loadChatExportMessages(['a', 'b'], readPage, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(readPage).not.toHaveBeenCalled();
});

test('a failed selected-ID read rejects the export', async () => {
  const failure = new Error('History unavailable');
  const readPage = jest.fn().mockRejectedValueOnce(failure);
  await expect(
    loadChatExportMessages(['a', 'b'], readPage, new AbortController().signal),
  ).rejects.toBe(failure);
});

test('citations become portable links without rewriting fenced, inline or escaped code examples', () => {
  const source = '[cite:one]\n\n~~~md\n[cite:one]\n~~~\n\n`` `[cite:one]` `` and \\[cite:one]';
  const result = replaceChatCitations(
    source,
    new Map([['one', { title: 'Source', url: 'https://example.com/' }]]),
  );
  expect(result).toBe(
    '[1](<https://example.com/>)\n\n~~~md\n[cite:one]\n~~~\n\n`` `[cite:one]` `` and \\[cite:one]',
  );
});

test('multiline inline code and quoted fences retain citation examples', () => {
  const code = '`code\n[cite:one]`\n\n> ```md\n> [cite:one]\n> ```\n\n';
  expect(
    replaceChatCitations(
      `${code}[cite:one]`,
      new Map([['one', { title: 'Source', url: 'https://example.com/' }]]),
    ),
  ).toBe(`${code}[1](<https://example.com/>)`);
});
