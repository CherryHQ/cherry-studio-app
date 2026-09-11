import type { AgentMessageView } from '@/shared/contracts/agent';

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
    process: 'Process',
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
  expect(document.sections[0].metadata).toEqual([]);
});

test('reasoning after text is still process rather than a final answer', () => {
  const unfinishedAnswer = message('c', 'assistant', answer.parts.slice(0, 2));
  expect(toChatExportDocument([unfinishedAnswer], options).sections[0].blocks).toEqual([]);
});

test('loads only the clicked answer and its same-turn question in reading order', async () => {
  const unrelated = { ...question, id: 'other-question', turnId: 'other-turn' };
  const readPage = jest.fn(async () => ({ items: [answer, unrelated, question] }));
  await expect(
    loadChatExportMessages('b', readPage, new AbortController().signal),
  ).resolves.toEqual([question, answer]);
  expect(readPage).toHaveBeenCalledTimes(1);
  expect(readPage).toHaveBeenCalledWith({ aroundMessageId: 'b', limit: 200 });
});

test('rejects missing, unsettled or incomplete turns instead of silently exporting a subset', async () => {
  const signal = new AbortController().signal;
  await expect(
    loadChatExportMessages('missing', async () => ({ items: [answer, question] }), signal),
  ).rejects.toThrow('Message unavailable');
  await expect(
    loadChatExportMessages(
      'b',
      async () => ({ items: [{ ...answer, status: 'streaming' }, question] }),
      signal,
    ),
  ).rejects.toThrow('Message is not settled');
  await expect(
    loadChatExportMessages('b', async () => ({ items: [answer] }), signal),
  ).rejects.toThrow('Question unavailable');
  const standalone = { ...answer, turnId: null };
  await expect(
    loadChatExportMessages('b', async () => ({ items: [standalone] }), signal),
  ).resolves.toEqual([standalone]);
});

test('cancellation after the persisted read prevents opening a preview', async () => {
  const controller = new AbortController();
  const readPage = jest.fn(async () => {
    controller.abort();
    return { items: [answer, question] };
  });
  await expect(loadChatExportMessages('b', readPage, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(readPage).toHaveBeenCalledTimes(1);
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
