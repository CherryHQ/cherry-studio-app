import {
  DetailSchema,
  MessageSchema,
  projectMessage,
  projectSnapshot,
  SnapshotSchema,
} from '../protocol';

it('preserves lightweight tool state without requiring argument or result content', () => {
  expect(
    DetailSchema.parse({
      partIndex: 4,
      type: 'tool',
      name: 'read_file',
      state: 'output-available',
      fields: ['input', 'output'],
    }),
  ).toEqual({
    partIndex: 4,
    type: 'tool',
    name: 'read_file',
    state: 'output-available',
    fields: ['input', 'output'],
  });
  expect(DetailSchema.safeParse({ partIndex: 0, type: 'text', fields: ['text'] }).success).toBe(
    true,
  );
});

it('preserves live execution identities, messages and approvals from PC snapshots', () => {
  const snapshot = projectSnapshot(
    SnapshotSchema.parse({
      session: { id: 's', agentId: 'a', name: 'Conversation' },
      processEpoch: 'pc-process',
      status: 'streaming',
      executions: [
        {
          executionId: 'pc-process.1.reply',
          messageId: 'reply',
          message: {
            id: 'reply',
            role: 'assistant',
            parts: [{ type: 'text', partIndex: 0, text: 'Hello' }],
            truncated: false,
            detailsAvailable: false,
          },
        },
      ],
      interactions: [{ interactionId: 'approval', toolName: 'read_file', canRespond: true }],
    }),
    'pc:pair',
  );
  expect(snapshot.executions).toEqual([{ id: 'pc-process.1.reply', messageId: 'reply' }]);
  expect(snapshot.liveMessages[0]).toMatchObject({ id: 'reply', status: 'streaming' });
  expect(snapshot.interactions).toEqual([
    { id: 'approval', toolName: 'read_file', canRespond: true },
  ]);
});

it('projects history from message status and parts', () => {
  const message = projectMessage(
    MessageSchema.parse({
      id: 'input',
      role: 'user',
      status: 'success',
      parts: [{ type: 'text', partIndex: 0, text: 'Hello' }],
      truncated: false,
      detailsAvailable: false,
    }),
    's',
    'pc:pair',
  );
  expect(message.status).toBe('success');
  expect(message.parts).toEqual([{ id: 'input:0', type: 'text', text: 'Hello', truncated: false }]);
});
