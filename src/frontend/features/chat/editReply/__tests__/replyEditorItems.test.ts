import type { AgentMessagePart, AgentMessageView } from '@/shared/contracts/agent';

import { replyEditorItems } from '../replyEditorItems';

const tool = (id: string): AgentMessagePart => ({
  id,
  type: 'dynamic-tool',
  toolCallId: id,
  toolName: 'read_file',
  title: 'Read file',
  toolRef: { source: 'builtin', capabilityId: 'read_file' },
  state: 'output-available',
  input: {},
  output: { value: 'Verified source', artifacts: [] },
});
const text = (id: string, value: string): AgentMessagePart => ({
  id,
  type: 'text',
  text: value,
  state: 'done',
});
const answer = (parts: AgentMessagePart[]): AgentMessageView => ({
  id: 'answer',
  sessionId: 'session',
  turnId: 'turn',
  parentId: 'question',
  role: 'assistant',
  status: 'success',
  parts,
  stats: null,
  modelId: null,
  inferenceSnapshot: null,
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
});

test('lays the answer out as the transcript does, with prose keyed by its source part', () => {
  const { process, answer: result } = replyEditorItems(
    answer([
      { id: 'reasoning', type: 'reasoning', text: 'Thinking', state: 'done' },
      { id: 'more-reasoning', type: 'reasoning', text: 'Still thinking', state: 'done' },
      text('intro', 'Looking it up.'),
      tool('search'),
      tool('fetch'),
      text('emptied', ''),
      text('narration', 'The train leaves early.'),
      tool('read'),
      text('final', 'Final answer'),
    ]),
  );
  expect(
    process.map((item) =>
      item.kind === 'tools'
        ? ['tools', item.tools.map((part) => part.toolCallId)]
        : item.kind === 'text'
          ? ['text', item.key, item.text]
          : [item.kind],
    ),
  ).toEqual([
    ['reasoning'],
    ['text', 'intro', 'Looking it up.'],
    ['tools', ['search', 'fetch']],
    ['text', 'narration', 'The train leaves early.'],
    ['tools', ['read']],
  ]);
  expect(result).toEqual([{ kind: 'text', key: 'final', text: 'Final answer' }]);
});

test('an answer without process is a single result', () => {
  expect(replyEditorItems(answer([text('final', 'Only text')]))).toEqual({
    answer: [{ kind: 'text', key: 'final', text: 'Only text' }],
    process: [],
  });
});
