import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { ContextView, ConversationId, EntryId, EntryRecord } from '@earendil-works/pi-durable';

import { applyPiReplyEdits, createPiReplyEdits, PI_REPLY_EDIT_KIND } from '../piReplyEditing';

const id = 1 as EntryId;
const conversationId = 1 as ConversationId;
const message: AssistantMessage = {
  role: 'assistant',
  api: 'anthropic-messages',
  provider: 'anthropic',
  model: 'model',
  timestamp: 1,
  stopReason: 'stop',
  content: [
    { type: 'thinking', thinking: 'Reasoning', thinkingSignature: 'signed' },
    { type: 'text', text: 'First', textSignature: 'original' },
    { type: 'text', text: ' fragment' },
  ],
  usage: {
    input: 10,
    output: 5,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 15,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
};
const entry: EntryRecord = { id, conversationId, kind: 'pi.assistant', model: [message] };
const view: ContextView = {
  head: undefined,
  entries: [entry],
  contributions: [[message]],
  messages: [message],
};

test('replaces merged text fragments without changing signed reasoning, usage or immutable records', () => {
  const edits = createPiReplyEdits(
    view,
    [entry],
    [{ id: 'pi:1:block:1', text: 'First fragment' }],
    'Edited',
  )!;
  expect(edits).toEqual([
    {
      target: id,
      action: 'replace',
      messages: [
        {
          ...message,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          content: [
            message.content[0],
            { type: 'text', text: 'Edited' },
            { type: 'text', text: '' },
          ],
        },
      ],
    },
  ]);
  const override: EntryRecord = {
    id: 2 as EntryId,
    conversationId,
    kind: PI_REPLY_EDIT_KIND,
    edits,
  };
  expect(applyPiReplyEdits([entry, override])[0].model).toEqual(
    edits[0].action === 'replace'
      ? edits[0].messages.map((edited) => ({ ...edited, usage: message.usage }))
      : [],
  );
  expect(message.content[1]).toEqual({ type: 'text', text: 'First', textSignature: 'original' });
});

test('falls back to Cherry history when the target was compacted or carries native web replay', () => {
  expect(
    createPiReplyEdits(
      { ...view, entries: [], contributions: [] },
      [entry],
      [{ id: 'pi:1:block:1', text: 'First fragment' }],
      'New',
    ),
  ).toBeUndefined();
  const web: AssistantMessage = {
    ...message,
    diagnostics: [
      {
        type: 'cherry.web',
        timestamp: 1,
        details: { version: 1, sources: [], texts: [], failed: false },
      },
    ],
  };
  expect(
    createPiReplyEdits(
      { ...view, contributions: [[web]] },
      [entry],
      [{ id: 'pi:1:block:1', text: 'First fragment' }],
      'New',
    ),
  ).toBeUndefined();
  expect(
    createPiReplyEdits(view, [entry], [{ id: 'imported-text', text: 'Old' }], 'New'),
  ).toBeUndefined();
});

test('refuses parts outside the answer turn or whose current context text has changed', () => {
  const parts = [{ id: 'pi:1:block:1', text: 'First fragment' }];
  // A rebuilt copy can reuse an entry ID that belonged to another copy's answer.
  expect(createPiReplyEdits(view, [], parts, 'New')).toBeUndefined();
  expect(
    createPiReplyEdits(view, [entry], [{ id: 'pi:1:block:1', text: 'Stale' }], 'New'),
  ).toBeUndefined();
  const [edit] = createPiReplyEdits(view, [entry], parts, 'Edited')!;
  const edited = { ...view, contributions: [edit.action === 'replace' ? edit.messages : []] };
  expect(createPiReplyEdits(edited, [entry], parts, 'Again')).toBeUndefined();
  expect(
    createPiReplyEdits(edited, [entry], [{ id: 'pi:1:block:1', text: 'Edited' }], 'Again'),
  ).toBeDefined();
});
