import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';

import { RemoteAgentActions } from '../RemoteAgentActions';
import { RemoteAgentError } from '../RemoteAgentClient';

function journal() {
  const values = new Map<string, string>();
  const storage = {
    read: (key: string) => values.get(key),
    write: jest.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  return { storage, port: storage as unknown as RemoteAgentCommandJournal };
}

it('persists before sending and restores the same action after a lost response', async () => {
  const { storage, port } = journal();
  const request = jest.fn(async (_method: string, params: unknown) => {
    expect(JSON.parse(storage.read('pc:pair')!).records[0].params).toEqual(params);
    throw new RemoteAgentError('CONNECTION_LOST', true);
  });
  const original = new RemoteAgentActions('pc:pair', port, request, () => {});
  const action = await original.create(
    'send',
    'messages.send',
    { sessionId: 'session', parts: [{ type: 'text', text: 'hello' }] },
    'hello',
  );
  expect(action.status).toBe('confirming');
  original.stop();
  const recoveredRequest = jest
    .fn()
    .mockRejectedValueOnce(new RemoteAgentError('NOT_FOUND'))
    .mockResolvedValueOnce({ status: 'accepted', sessionId: 'session', userMessageId: 'message' });
  const recovered = new RemoteAgentActions('pc:pair', port, recoveredRequest, () => {});
  await recovered.retry(action.id);
  expect(recoveredRequest.mock.calls).toEqual([
    ['commands.get', { commandId: action.id }],
    ['messages.send', request.mock.calls[0][1]],
  ]);
  expect(recovered.get()[0].status).toBe('accepted');
});

it('never re-executes a receipt already admitted by the PC', async () => {
  const { port } = journal();
  const request = jest
    .fn()
    .mockRejectedValueOnce(new RemoteAgentError('REQUEST_TIMEOUT', true))
    .mockResolvedValueOnce({ status: 'queued', userMessageId: 'message' });
  const actions = new RemoteAgentActions('pc:pair', port, request, () => {});
  const action = await actions.create('send', 'messages.send', {
    sessionId: 's',
    parts: [{ type: 'text', text: 'follow-up' }],
  });
  await actions.retry(action.id);
  expect(actions.get()[0].status).toBe('queued');
  expect(request.mock.calls.map(([method]) => method)).toEqual(['messages.send', 'commands.get']);
  await actions.retry(action.id);
  expect(request).toHaveBeenCalledTimes(2);
});

it('keeps an approval response associated with its request through recovery', async () => {
  const { port } = journal();
  const request = jest.fn().mockRejectedValue(new RemoteAgentError('REQUEST_TIMEOUT', true));
  const original = new RemoteAgentActions('pc:pair', port, request, () => {});
  const action = await original.create('respond', 'interactions.respond', {
    sessionId: 'session',
    interactionId: 'approval-1',
    response: { approved: true },
  });
  expect(action).toMatchObject({ interactionId: 'approval-1', status: 'confirming' });
  original.stop();

  const recoveredRequest = jest.fn().mockResolvedValue({ status: 'applied' });
  const recovered = new RemoteAgentActions('pc:pair', port, recoveredRequest, () => {});
  expect(recovered.get()[0]).toMatchObject({ interactionId: 'approval-1', status: 'confirming' });
  await recovered.retry(action.id);
  expect(recovered.get()[0]).toMatchObject({ interactionId: 'approval-1', status: 'applied' });
  expect(recoveredRequest.mock.calls).toEqual([['commands.get', { commandId: action.id }]]);
});

it('retains an interrupted command receipt without treating it as a fresh send', async () => {
  const { port } = journal();
  const request = jest
    .fn()
    .mockRejectedValueOnce(new RemoteAgentError('REQUEST_TIMEOUT', true))
    .mockResolvedValueOnce({ status: 'interrupted', userMessageId: 'message' });
  const actions = new RemoteAgentActions('pc:pair', port, request, () => {});
  const action = await actions.create('send', 'messages.send', {
    sessionId: 's',
    parts: [{ type: 'text', text: 'hello' }],
  });
  await actions.retry(action.id);
  expect(actions.get()[0]).toMatchObject({ status: 'interrupted', userMessageId: 'message' });
  await actions.retry(action.id);
  expect(request.mock.calls.map(([method]) => method)).toEqual(['messages.send', 'commands.get']);
});

it('does not send when the durable pre-send write fails', async () => {
  const { storage, port } = journal();
  storage.write.mockImplementation(() => {
    throw new Error('disk full');
  });
  const request = jest.fn();
  const actions = new RemoteAgentActions('pc:pair', port, request, () => {});
  await expect(actions.create('create', 'sessions.create', { agentId: 'a' })).rejects.toThrow(
    'disk full',
  );
  expect(request).not.toHaveBeenCalled();
});

it('keeps unknown actions recoverable and ignores late writes after a binding is retired', async () => {
  const { storage, port } = journal();
  let resolve!: (value: unknown) => void;
  const request = jest.fn(
    () =>
      new Promise<unknown>((done) => {
        resolve = done;
      }),
  );
  const actions = new RemoteAgentActions('pc:pair', port, request, () => {});
  const sending = actions.create('create', 'sessions.create', { agentId: 'a' });
  actions.dismiss(actions.get()[0].id);
  expect(actions.get()).toHaveLength(1);
  actions.stop();
  resolve({ status: 'accepted', sessionId: 's' });
  await sending;
  expect(storage.write).toHaveBeenCalledTimes(1);
  expect(new RemoteAgentActions('other:pair', port, request, () => {}).get()).toEqual([]);
});
