import type { AgentMessagePart } from '@/shared/contracts/agent';

import { applyReplyEdits, editableReplyParts } from '../assistantReply';

const parts: AgentMessagePart[] = [
  { id: 'reasoning', type: 'reasoning', text: 'Thoughts', state: 'done' },
  { id: 'intro', type: 'text', text: 'Looking it up.', state: 'done' },
  {
    id: 'tool',
    type: 'dynamic-tool',
    toolCallId: 'call',
    toolName: 'read_file',
    title: 'Read file',
    toolRef: { source: 'builtin', capabilityId: 'read_file' },
    state: 'output-available',
    input: {},
    output: { value: 'Verified source', artifacts: [] },
  },
  { id: 'emptied', type: 'text', text: '', state: 'done' },
  { id: 'answer', type: 'text', text: 'Answer', state: 'done' },
];

test('prose between tool calls and the result are editable; reasoning and receipts are not', () => {
  expect(editableReplyParts(parts).map((part) => part.id)).toEqual(['intro', 'answer']);
  const edited = applyReplyEdits(parts, [
    { id: 'intro', expectedText: 'Looking it up.', text: 'Checking the source.' },
    { id: 'answer', expectedText: 'Answer', text: 'Corrected answer' },
  ])!;
  expect(edited).toEqual([
    parts[0],
    { ...parts[1], text: 'Checking the source.' },
    parts[2],
    parts[3],
    { ...parts[4], text: 'Corrected answer' },
  ]);
});

test('stale text and non-prose targets reject the whole edit', () => {
  expect(
    applyReplyEdits(parts, [
      { id: 'intro', expectedText: 'Looking it up.', text: 'Changed' },
      { id: 'answer', expectedText: 'Old answer', text: 'Changed' },
    ]),
  ).toBeUndefined();
  for (const id of ['reasoning', 'tool', 'emptied', 'missing'])
    expect(applyReplyEdits(parts, [{ id, expectedText: 'Thoughts', text: 'Changed' }])).toBe(
      undefined,
    );
});
