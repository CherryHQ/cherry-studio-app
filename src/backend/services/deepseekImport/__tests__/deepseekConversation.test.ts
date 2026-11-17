import { type FileEntry, FileEntrySchema } from '@/shared/data/types/file';

import { convertDeepseekConversation, deepseekFileKey } from '../deepseekConversation';
import { deepseekConversationSchema } from '../deepseekFormat';

const time = '2026-11-01T10:00:00.000Z';
function fixture() {
  return {
    id: 'conversation',
    title: 'Original title',
    inserted_at: time,
    current_message_id: 2,
    messages: [
      {
        id: 1,
        parent_id: null,
        role: 'USER',
        status: 'FINISHED',
        inserted_at: time,
        fragments: [{ type: 'REQUEST', content: 'Question' }],
      },
      {
        id: 2,
        parent_id: 1,
        role: 'ASSISTANT',
        status: 'FINISHED',
        inserted_at: time,
        fragments: [
          { type: 'THINK', content: 'Reasoning' },
          { type: 'RESPONSE', content: 'Selected answer' },
        ],
      },
      {
        id: 3,
        parent_id: 1,
        role: 'ASSISTANT',
        status: 'FINISHED',
        inserted_at: time,
        fragments: [{ type: 'RESPONSE', content: 'Other answer' }],
      },
    ],
  };
}
function convert(value: unknown, files: ReadonlyMap<string, FileEntry> = new Map()) {
  const conversation = deepseekConversationSchema.parse(value);
  let id = 0;
  return convertDeepseekConversation(conversation, {
    agentId: 'agent',
    conversationId: 'conversation',
    updatedAt: Date.parse(time),
    now: 0,
    files,
    createId: () => `id-${++id}`,
  });
}

test('retains sibling answers and the selected older branch with remapped identities and original time', () => {
  const result = convert(fixture());
  const [question, selected, other] = result.messages;
  expect(result.session).toMatchObject({
    name: 'Original title',
    activeNodeId: selected.id,
    createdAt: Date.parse(time),
    lastActivityAt: Date.parse(time),
  });
  expect(selected.parentId).toBe(question.id);
  expect(other.parentId).toBe(question.id);
  expect(selected.turnId).toBe(question.turnId);
  expect(other.turnId).toBe(question.turnId);
  expect(selected.data.parts).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'reasoning', text: 'Reasoning' })]),
  );
  expect(selected.searchableText).toBe('Selected answer');
});

test.each([0, null, undefined])(
  'retains an empty conversation with selected message %s',
  (selected) => {
    const result = convert({ ...fixture(), messages: [], current_message_id: selected });
    expect(result.session).toMatchObject({ activeNodeId: null, name: 'Original title' });
    expect(result.messages).toEqual([]);
  },
);

test('falls back to the last message when the selected message does not exist', () => {
  const result = convert({ ...fixture(), current_message_id: 999 });
  expect(result.session.activeNodeId).toBe(result.messages[2].id);
  expect(convert({ ...fixture(), messages: [], current_message_id: 2 }).session).toMatchObject({
    activeNodeId: null,
  });
});

test('repairs a damaged tree into alternating questions and answers instead of rejecting it', () => {
  const value = fixture();
  value.messages.push(
    { ...value.messages[2], id: 2, fragments: [{ type: 'RESPONSE', content: 'Duplicate' }] },
    // An answer to an answer becomes another answer to the question above it.
    { ...value.messages[2], id: 4, parent_id: 2 },
    // A question below a question becomes a new root question.
    { ...value.messages[0], id: 5, parent_id: 1 },
    // A missing parent makes a question a root.
    { ...value.messages[0], id: 6, parent_id: 99 },
    // An answer without any question cannot be shown and is dropped; its child question remains.
    { ...value.messages[2], id: 7, parent_id: 99 },
    { ...value.messages[0], id: 8, parent_id: 7 },
  );
  const result = convert(value);
  const question = result.messages[0];
  expect(result.messages).toHaveLength(7);
  expect(result.messages.map((message) => message.searchableText)).not.toContain('Duplicate');
  for (const answer of result.messages.filter((message) => message.role === 'assistant')) {
    expect(answer.parentId).toBe(question.id);
    expect(answer.turnId).toBe(question.turnId);
  }
  const questions = result.messages.filter((message) => message.role === 'user');
  expect(questions.map((message) => message.parentId)).toEqual([null, null, null, null]);
  expect(new Set(questions.map((message) => message.turnId)).size).toBe(4);
  expect(result.session.activeNodeId).toBe(result.messages[1].id);
});

test('drops malformed messages and fragments, accepts lowercase roles and fills missing times', () => {
  const value = fixture();
  const messages: unknown[] = [
    { ...value.messages[0], role: 'user', inserted_at: undefined },
    {
      ...value.messages[1],
      status: undefined,
      fragments: [
        { type: 'RESPONSE', content: 'Kept answer' },
        { type: 'FILE', files: 'not a list' },
        { type: 'FUTURE_FRAGMENT', data: 1 },
        null,
      ],
    },
    { id: 'broken', role: 'ASSISTANT' },
    { ...value.messages[2], role: 'SYSTEM' },
  ];
  const result = convert({ ...value, inserted_at: 'not a time', messages });
  expect(result.messages).toHaveLength(2);
  expect(result.messages[1]).toMatchObject({ status: 'success', searchableText: 'Kept answer' });
  expect(result.session).toMatchObject({
    createdAt: Date.parse(time),
    lastActivityAt: Date.parse(time),
  });
  expect(result.messages[0].createdAt).toBe(Date.parse(time));
});

test('retains stopped answer text while excluding failure templates from model-visible text', () => {
  const value = fixture();
  value.messages[1].status = 'INCOMPLETE';
  value.messages[2].status = 'TIMEOUT';
  value.messages[2].fragments = [{ type: 'TEMPLATE_RESPONSE', content: 'Original timeout notice' }];
  const result = convert(value);
  expect(result.messages[1]).toMatchObject({
    status: 'interrupted',
    searchableText: 'Selected answer',
  });
  expect(result.messages[2]).toMatchObject({ status: 'error', searchableText: '' });
  expect(result.messages[2].data.parts).toEqual([
    expect.objectContaining({
      type: 'data-error',
      data: expect.objectContaining({
        retryable: false,
        message: expect.stringContaining('Original timeout notice'),
      }),
    }),
  ]);
});

test.each([
  ['photo.png', 'image/png'],
  ['photo.jpg', 'image/jpeg'],
])(
  'uses canonical managed image metadata %s and preserves missing attachment names',
  (filename, mediaType) => {
    const file = {
      id: 'image',
      file_name: 'photo.png',
      file_size: 20,
      is_image: true,
      export_path: 'chat_sessions/conversation_files/image_photo.png',
    };
    const value = fixture();
    const source = {
      ...value,
      messages: [
        {
          ...value.messages[0],
          fragments: [
            {
              type: 'FILE',
              files: [
                file,
                {
                  ...file,
                  id: 'document',
                  is_image: false,
                  file_name: 'notes.pdf',
                  export_path: null,
                },
              ],
            },
          ],
        },
        ...value.messages.slice(1),
      ],
    };
    const entry = FileEntrySchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      filename,
      mediaType,
      size: 20,
      provenance: 'imported',
      createdAt: 1,
      updatedAt: 1,
    });
    const result = convert(source, new Map([[deepseekFileKey(value.id, file), entry]]));
    expect(result.missingAttachments).toBe(1);
    expect(result.messages[0].data.parts).toEqual([
      expect.objectContaining({ type: 'file', fileEntryId: entry.id, filename, mediaType }),
      expect.objectContaining({ type: 'text', text: '📎 notes.pdf' }),
    ]);
  },
);
