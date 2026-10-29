import type { AgentMessagePart } from '@/shared/contracts/agent';

import { editableAssistantReply, replaceAssistantReply } from '../assistantReply';

test('editing final text preserves earlier explanations, reasoning and confirmed tool receipts', () => {
  const parts: AgentMessagePart[] = [
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
    { id: 'reasoning', type: 'reasoning', text: 'Thoughts', state: 'done' },
    { id: 'first', type: 'text', text: 'First paragraph', state: 'done' },
    { id: 'second', type: 'text', text: 'Second paragraph', state: 'done' },
  ];
  expect(editableAssistantReply(parts)?.text).toBe('First paragraph\n\nSecond paragraph');
  const edited = replaceAssistantReply(parts, 'Corrected answer');
  expect(edited.slice(0, 3)).toEqual(parts.slice(0, 3));
  expect(edited.slice(3)).toEqual([
    { ...parts[3], text: 'Corrected answer' },
    { ...parts[4], text: '' },
  ]);
  expect(editableAssistantReply(edited)?.text).toBe('Corrected answer');
  expect(replaceAssistantReply(edited, 'Edited again')[3]).toMatchObject({
    id: 'first',
    text: 'Edited again',
  });
});

test('reasoning-only and empty answers have no editable text', () => {
  expect(
    editableAssistantReply([{ id: 'r', type: 'reasoning', text: 'Thinking', state: 'done' }]),
  ).toBeUndefined();
  expect(editableAssistantReply([{ type: 'text', text: ' ' }])).toBeUndefined();
});
