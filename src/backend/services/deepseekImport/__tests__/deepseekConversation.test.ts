import { type FileEntry, FileEntrySchema } from '@/shared/data/types/file';

import { convertDeepseekConversation, deepseekFileKey } from '../deepseekConversation';
import { deepseekConversationSchema, validateDeepseekTree } from '../deepseekFormat';

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
  validateDeepseekTree(conversation);
  let id = 0;
  return convertDeepseekConversation(conversation, {
    agentId: 'agent',
    updatedAt: Date.parse(time),
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

test('rejects a nonzero selected message in an empty conversation', () => {
  expect(() => convert({ ...fixture(), messages: [], current_message_id: 2 })).toThrow(
    'DeepSeek import: invalid',
  );
});

test.each([
  (value: ReturnType<typeof fixture>) => {
    value.messages[2].id = 2;
  },
  (value: ReturnType<typeof fixture>) => {
    value.messages[1].parent_id = 3;
  },
  (value: ReturnType<typeof fixture>) => {
    value.messages[0].role = 'ASSISTANT';
  },
  (value: ReturnType<typeof fixture>) => {
    value.current_message_id = 999;
  },
])('rejects an invalid message tree instead of silently dropping nodes', (damage) => {
  const value = fixture();
  damage(value);
  expect(() => convert(value)).toThrow('DeepSeek import: invalid');
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
