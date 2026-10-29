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
    [{ id: 'pi:1:block:1', expectedText: 'First fragment', text: 'Edited' }],
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
      [{ id: 'pi:1:block:1', expectedText: 'First fragment', text: 'New' }],
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
      [{ id: 'pi:1:block:1', expectedText: 'First fragment', text: 'New' }],
    ),
  ).toBeUndefined();
  expect(
    createPiReplyEdits(view, [entry], [{ id: 'imported-text', expectedText: 'Old', text: 'New' }]),
  ).toBeUndefined();
});

test('refuses parts outside the answer turn or whose current context text has changed', () => {
  const parts = [{ id: 'pi:1:block:1', expectedText: 'First fragment', text: 'Edited' }];
  // A rebuilt copy can reuse an entry ID that belonged to another copy's answer.
  expect(createPiReplyEdits(view, [], parts)).toBeUndefined();
  expect(
    createPiReplyEdits(view, [entry], [{ id: 'pi:1:block:1', expectedText: 'Stale', text: 'New' }]),
  ).toBeUndefined();
  const [edit] = createPiReplyEdits(view, [entry], parts)!;
  const edited = { ...view, contributions: [edit.action === 'replace' ? edit.messages : []] };
  expect(createPiReplyEdits(edited, [entry], parts)).toBeUndefined();
  expect(
    createPiReplyEdits(
      edited,
      [entry],
      [{ id: 'pi:1:block:1', expectedText: 'Edited', text: 'Again' }],
    ),
  ).toBeDefined();
});

test('keeps the OpenAI Responses output item identity on the replaced text', () => {
  const signature = JSON.stringify({ v: 1, id: 'msg_1', phase: 'final_answer' });
  const responses: AssistantMessage = {
    ...message,
    api: 'openai-responses',
    content: [message.content[0]!, { type: 'text', text: 'Answer', textSignature: signature }],
  };
  const [edit] = createPiReplyEdits(
    { ...view, contributions: [[responses]] },
    [entry],
    [{ id: 'pi:1:block:1', expectedText: 'Answer', text: 'Edited' }],
  )!;
  expect(edit.action === 'replace' && edit.messages[0]).toMatchObject({
    content: [responses.content[0], { type: 'text', text: 'Edited', textSignature: signature }],
  });
});

test('edits each prose part in its own block, including narration in another entry', () => {
  const narration: AssistantMessage = {
    ...message,
    api: 'openai-completions',
    content: [{ type: 'text', text: 'Looking it up.' }],
  };
  const answer: AssistantMessage = {
    ...message,
    api: 'openai-completions',
    content: [{ type: 'text', text: 'Answer' }],
  };
  const first = { ...entry, model: [narration] };
  const second = { ...entry, id: 3 as EntryId, model: [answer] };
  const edits = createPiReplyEdits(
    {
      head: undefined,
      entries: [first, second],
      contributions: [[narration], [answer]],
      messages: [],
    },
    [first, second],
    [
      { id: 'pi:1:block:0', expectedText: 'Looking it up.', text: 'Checking the timetable.' },
      { id: 'pi:3:block:0', expectedText: 'Answer', text: 'Edited answer' },
    ],
  )!;
  expect(
    edits.map((edit) => [
      edit.target,
      edit.action === 'replace' ? edit.messages[0]!.content : undefined,
    ]),
  ).toEqual([
    [1, [{ type: 'text', text: 'Checking the timetable.' }]],
    [3, [{ type: 'text', text: 'Edited answer' }]],
  ]);
});
