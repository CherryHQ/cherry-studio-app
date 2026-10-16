import type { AssistantMutation } from '@cherrystudio/remote-protocol/assistant';

import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import { RemoteConversationError } from '@/backend/services/remoteConversation';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import type { AssistantRequest } from '../assistantRequest';
import { RemoteAssistantActions } from '../RemoteAssistantActions';

const revision = 'a'.repeat(64);
const send = {
  topicId: 'topic',
  assistantId: 'assistant',
  expectedAssistantRevision: revision,
  parentAnchorId: null,
  expectedHistoryRevision: '0',
  text: '你好',
};
const receipt = (id: string, method: AssistantMutation, status = 'applied') => ({
  commandId: id,
  method,
  status,
  admittedAt: '2026-10-14T00:00:00.000Z',
  topicId: 'topic',
});
function journal() {
  const storage = new Map<string, string>();
  return {
    storage,
    port: new RemoteAgentCommandJournal({
      getString: (key) => storage.get(key),
      set: (key, value) => {
        storage.set(key, value as string);
      },
      getAllKeys: () => [...storage.keys()],
      remove: (key) => storage.delete(key),
    }),
  };
}

it('persists the original send before transport and recovers its receipt without resending', async () => {
  const { storage, port } = journal();
  let id = '';
  const request = jest.fn(async (_method, params) => {
    id = params.commandId;
    expect(JSON.parse(storage.get('pc:assistant:grant')!).records[0].params).toEqual({
      ...send,
      commandId: id,
    });
    throw new RemoteConversationError('CONNECTION_LOST', true);
  });
  const first = new RemoteAssistantActions(
    'pc:assistant:grant',
    port,
    request as AssistantRequest,
    () => {},
  );
  expect(await first.create('send', 'assistant.messages.send', send, send.text)).toMatchObject({
    id,
    status: 'pending',
  });
  first.stop();
  const recover = jest.fn(async () => receipt(id, 'assistant.messages.send'));
  const second = new RemoteAssistantActions(
    'pc:assistant:grant',
    port,
    recover as AssistantRequest,
    () => {},
  );
  await second.recover();
  expect(recover.mock.calls).toEqual([['assistant.commands.get', { commandId: id }]]);
  expect(second.get()).toMatchObject([{ id, status: 'applied', text: '你好' }]);
});

it('retries an unrecorded command with its exact id and revision rather than rebasing the text', async () => {
  const { port } = journal();
  const first = new RemoteAssistantActions(
    'pc',
    port,
    (async () => {
      throw new RemoteConversationError('CONNECTION_LOST', true);
    }) as AssistantRequest,
    () => {},
  );
  const pending = await first.create('send', 'assistant.messages.send', send, send.text);
  first.stop();
  const request = jest.fn(async (method, params) => {
    if (method === 'assistant.commands.get') throw new RemoteConversationError('NOT_FOUND');
    return {
      ...receipt(params.commandId, method),
      status: 'rejected',
      error: { reason: 'CONFLICT', message: 'Branch changed' },
    };
  });
  const second = new RemoteAssistantActions('pc', port, request as AssistantRequest, () => {});
  await second.recover();
  await second.recover();
  expect(request.mock.calls).toEqual([
    ['assistant.commands.get', { commandId: pending.id }],
    ['assistant.messages.send', { ...send, commandId: pending.id }],
  ]);
  expect(second.get()).toMatchObject([{ status: 'rejected', text: '你好', error: 'CONFLICT' }]);
});

it('recovers creation before sending the first text, without a workspace or a second topic', async () => {
  const { port } = journal();
  let createId = '';
  const first = new RemoteAssistantActions(
    'pc',
    port,
    (async (method, params) => {
      expect(method).toBe('assistant.topics.create');
      createId = (params as { commandId: string }).commandId;
      throw new RemoteConversationError('CONNECTION_LOST', true);
    }) as AssistantRequest,
    () => {},
  );
  expect(
    await first.start({ draftId: 'draft', agentId: 'assistant', text: 'Hello' }, revision),
  ).toMatchObject({ status: 'pending' });
  first.stop();
  const request = jest.fn(async (method, params) => {
    if (method === 'assistant.commands.get') return receipt(createId, 'assistant.topics.create');
    if (method === 'assistant.topics.get')
      return {
        topic: {
          topicId: 'topic',
          assistantId: 'assistant',
          parentAnchorId: null,
          historyRevision: '0',
          activeExecutionIds: [],
        },
      };
    if (method === 'assistant.messages.send') return receipt(params.commandId, method);
    throw new Error(method);
  });
  const recovered = new RemoteAssistantActions('pc', port, request as AssistantRequest, () => {});
  await recovered.recover();
  expect(
    request.mock.calls.filter(([method]) => method === 'assistant.topics.create'),
  ).toHaveLength(0);
  expect(
    request.mock.calls.filter(([method]) => method === 'assistant.messages.send'),
  ).toHaveLength(1);
  expect(recovered.getStarts()).toMatchObject([
    { draftId: 'draft', sessionId: 'topic', status: 'applied' },
  ]);
  const sent = request.mock.calls.find(([method]) => method === 'assistant.messages.send')![1];
  expect(sent).toMatchObject({
    assistantId: 'assistant',
    expectedAssistantRevision: revision,
    expectedHistoryRevision: '0',
    parentAnchorId: null,
    text: 'Hello',
  });
  expect(sent).not.toHaveProperty('workspaceId');
});

it('retains a rejected first send with the created topic after the draft route releases it', async () => {
  const { port } = journal();
  const actions = new RemoteAssistantActions(
    'pc',
    port,
    (async (method, params) => {
      const command = params as { commandId: string };
      if (method === 'assistant.topics.get')
        return {
          topic: {
            topicId: 'topic',
            assistantId: 'assistant',
            parentAnchorId: null,
            historyRevision: '0',
            activeExecutionIds: [],
          },
        };
      if (method === 'assistant.messages.send') throw new RemoteConversationError('CONFLICT');
      return receipt(command.commandId, 'assistant.topics.create');
    }) as AssistantRequest,
    () => {},
  );
  const result = await actions.start(
    { draftId: 'draft', agentId: 'assistant', text: 'keep me' },
    revision,
  );
  expect(result).toMatchObject({ status: 'rejected', sessionId: 'topic' });
  actions.release(result.id);
  expect(actions.getStarts()).toEqual([]);
  expect(actions.get()).toMatchObject([
    { kind: 'send', status: 'rejected', sessionId: 'topic', text: 'keep me' },
  ]);
});

it('rejects invalid first text before creating a topic or writing a journal', async () => {
  const { storage, port } = journal();
  const request = jest.fn();
  const actions = new RemoteAssistantActions('pc', port, request, () => {});
  await expect(
    actions.start({ draftId: 'draft', agentId: 'assistant', text: '   ' }, revision),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});

it('cannot recover another grant or domain journal', async () => {
  const { port } = journal();
  const request = jest.fn(async () => {
    throw new RemoteConversationError('CONNECTION_LOST', true);
  });
  const first = new RemoteAssistantActions(
    'pc:assistant:grant-a',
    port,
    request as AssistantRequest,
    () => {},
  );
  await first.create('send', 'assistant.messages.send', send, send.text);
  first.stop();
  request.mockClear();
  const replacement = new RemoteAssistantActions(
    'pc:assistant:grant-b',
    port,
    request as AssistantRequest,
    () => {},
  );
  await replacement.recover();
  expect(request).not.toHaveBeenCalled();
  expect(replacement.get()).toEqual([]);
});

it('recovers a file-only first send with its frozen upload references and original topic', async () => {
  const { port, storage } = journal();
  const file = {
    fileEntryId: FileEntryIdSchema.parse('12345678-1234-4234-8234-123456789abc'),
    name: 'report.pdf',
    mediaType: 'application/pdf',
  };
  const prepared = {
    sessionId: 'topic',
    selectionId: 'selection',
    uploaded: [{ uploadId: 'uploaded-file' }],
  };
  let original: Record<string, unknown> | undefined;
  const first = new RemoteAssistantActions(
    'pc',
    port,
    (async (method, params) => {
      if (method === 'assistant.topics.get')
        return {
          topic: {
            topicId: 'topic',
            assistantId: 'assistant',
            parentAnchorId: null,
            historyRevision: '0',
            activeExecutionIds: [],
          },
        };
      if (method === 'assistant.messages.send') {
        original = params;
        const saved = JSON.parse(storage.get('pc')!);
        expect(saved.starts[0]).toMatchObject({ ...prepared, attachments: [file] });
        expect(saved.records[0].params).toEqual(params);
        throw new RemoteConversationError('CONNECTION_LOST', true);
      }
      throw new Error(`Must reuse the prepared topic: ${method}`);
    }) as AssistantRequest,
    () => {},
  );
  expect(
    await first.start(
      {
        draftId: 'file-draft',
        agentId: 'assistant',
        text: '',
        attachments: [file],
      },
      revision,
      prepared,
    ),
  ).toMatchObject({ status: 'pending', sessionId: 'topic', attachments: [file] });
  expect(original).toMatchObject({
    text: '',
    attachments: prepared.uploaded,
    selectionId: 'selection',
  });
  first.stop();
  const replayed: unknown[] = [];
  const recovered = new RemoteAssistantActions(
    'pc',
    port,
    (async (method, params) => {
      if (method === 'assistant.commands.get') throw new RemoteConversationError('NOT_FOUND');
      if (method !== 'assistant.messages.send') throw new Error(`Unexpected recovery: ${method}`);
      replayed.push(params);
      return {
        ...receipt((params as { commandId: string }).commandId, method),
        status: 'rejected',
        error: { reason: 'CONFLICT', message: 'Branch changed' },
      };
    }) as AssistantRequest,
    () => {},
  );
  await recovered.recover();
  expect(replayed).toEqual([original]);
  expect(recovered.getStarts()[0]).toMatchObject({ status: 'rejected', attachments: [file] });
  recovered.release(recovered.getStarts()[0].id);
  expect(recovered.get()).toMatchObject([
    { status: 'rejected', sessionId: 'topic', text: '', attachments: [file] },
  ]);
});
