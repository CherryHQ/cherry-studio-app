import type { AgentMessageView } from '@/shared/contracts/agent';

import { chatShareMessagePreview } from '../chatShareMessagePreview';

const message = (parts: AgentMessageView['parts']) => ({ parts }) as AgentMessageView;

test('uses the answer excerpt without sending the full reply to native text layout', () => {
  expect(
    chatShareMessagePreview(
      message([
        { id: 'process', type: 'text', text: 'Checking…', state: 'done' },
        { id: 'reasoning', type: 'reasoning', text: 'Private thought', state: 'done' },
        { id: 'answer', type: 'text', text: 'Answer '.repeat(10_000), state: 'done' },
      ]),
    ),
  ).toBe('Answer '.repeat(10_000).slice(0, 240).trim());
});

test('uses an attachment name when there is no answer text', () => {
  expect(
    chatShareMessagePreview(
      message([
        {
          id: 'file',
          type: 'file',
          fileEntryId: 'file',
          name: 'report.pdf',
          mediaType: 'application/pdf',
          purpose: 'artifact',
        },
      ]),
    ),
  ).toBe('report.pdf');
});

test('does not expose reasoning as the message excerpt', () => {
  expect(
    chatShareMessagePreview(
      message([{ id: 'reasoning', type: 'reasoning', text: 'Private thought', state: 'done' }]),
    ),
  ).toBe('');
});
