import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';

import { RemoteAgentActions } from '../RemoteAgentActions';
import { RemoteAgentError } from '../RemoteAgentError';

function journal() {
  const values = new Map<string, string>();
  const storage = {
    read: (key: string) => values.get(key),
    write: jest.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    remove: jest.fn((key: string) => {
      values.delete(key);
    }),
  };
  return { storage, port: storage as unknown as RemoteAgentCommandJournal };
}
const params = { sessionId: 's', text: 'hello', expectedIdleRevision: '1' };
const method = 'agent.messages.send';
const receipt = (commandId: string, status: string, extra = {}) => ({
  commandId,
  method,
  status,
  admittedAt: '2026-09-22T00:00:00.000Z',
  sessionId: 's',
  ...extra,
});

it('persists before sending and resends identical parameters after a lost response and absent receipt', async () => {
  const { storage, port } = journal();
  const request = jest.fn(async (_method: string, body: unknown) => {
    expect(JSON.parse(storage.read('pc:grant')!).records[0].params).toEqual(body);
    throw new RemoteAgentError('CONNECTION_LOST', true);
  });
  const original = new RemoteAgentActions('pc:grant', port, request, () => {});
  const action = await original.create('send', method, params, 'hello');
  expect(action.status).toBe('confirming');
  original.stop();
  const recoveredRequest = jest
    .fn()
    .mockRejectedValueOnce(new RemoteAgentError('NOT_FOUND'))
    .mockResolvedValueOnce(receipt(action.id, 'applied'));
  const recovered = new RemoteAgentActions('pc:grant', port, recoveredRequest, () => {});
  await recovered.retry(action.id);
  expect(recoveredRequest.mock.calls).toEqual([
    ['agent.commands.get', { commandId: action.id }],
    [method, request.mock.calls[0][1]],
  ]);
  expect(recovered.get()[0].status).toBe('applied');
  expect(JSON.parse(storage.read('pc:grant')!).records[0].receipt.status).toBe('applied');
});

it('polls admitted commands until the owner outcome is known, without repeating the mutation', async () => {
  const { port } = journal();
  const request = jest.fn(async (_method: string, body: any) =>
    receipt(body.commandId, 'accepted'),
  );
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const action = await actions.create('send', method, params);
  actions.dismiss(action.id);
  expect(actions.get()).toHaveLength(1);
  request.mockImplementation(async (_method, body) => receipt(body.commandId, 'applied'));
  await actions.retry(action.id);
  await actions.retry(action.id);
  expect(request.mock.calls.map(([name]) => name)).toEqual([method, 'agent.commands.get']);
});

it('clears dismissed outcomes and removes the empty binding without losing uncertain commands', async () => {
  const { storage, port } = journal();
  const request = jest.fn(async (name: string, body: any) =>
    receipt(body.commandId, 'applied', {
      method: name === 'agent.commands.get' ? method : name,
    }),
  );
  request.mockRejectedValueOnce(new RemoteAgentError('CONNECTION_LOST', true));
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const pending = await actions.create('send', method, params);
  const applied = await actions.create('cancel', 'agent.executions.cancel', { sessionId: 's' });
  actions.dismiss(applied.id);
  actions.dismiss(pending.id);
  expect(
    JSON.parse(storage.read('pc:grant')!).records.map((entry: any) => entry.action.id),
  ).toEqual([pending.id]);
  expect(storage.remove).not.toHaveBeenCalled();
  await actions.retry(pending.id);
  actions.dismiss(pending.id);
  expect(storage.read('pc:grant')).toBeUndefined();
  expect(new RemoteAgentActions('pc:grant', port, request, () => {}).get()).toEqual([]);
});

it.each(['interrupted', 'rejected'])('does not retry terminal %s receipts', async (status) => {
  const { port } = journal();
  const request = jest.fn(async (_method: string, body: any) =>
    receipt(body.commandId, status, { error: { reason: 'CONFLICT', message: 'changed' } }),
  );
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const action = await actions.create('send', method, params, 'restore this draft');
  expect(action).toMatchObject({
    status: status === 'rejected' ? 'failed' : 'interrupted',
    text: 'restore this draft',
    error: 'CONFLICT',
    errorMessage: 'changed',
  });
  await actions.retry(action.id);
  expect(request).toHaveBeenCalledTimes(1);
});

it('stops recovery after an idempotency conflict', async () => {
  const { port } = journal();
  const request = jest.fn().mockRejectedValue(new RemoteAgentError('IDEMPOTENCY_CONFLICT'));
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const action = await actions.create('send', method, params);
  await actions.retry(action.id);
  expect(action).toMatchObject({ status: 'failed', error: 'IDEMPOTENCY_CONFLICT' });
  expect(request).toHaveBeenCalledTimes(1);
});

it('keeps malformed or mismatched receipts uncertain', async () => {
  const { port } = journal();
  const request = jest.fn().mockResolvedValue(receipt('another-command', 'applied'));
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const action = await actions.create('send', method, params);
  expect(action.status).toBe('confirming');
});

it('keeps approval guards and response target through recovery', async () => {
  const { port } = journal();
  const request = jest.fn().mockRejectedValue(new RemoteAgentError('CONNECTION_LOST', true));
  const original = new RemoteAgentActions('pc:grant', port, request, () => {});
  const action = await original.create('respond', 'agent.interactions.respond', {
    sessionId: 's',
    interactionId: 'approval',
    expectedRevision: '2',
    expectedExecutionId: 'execution',
    inputDigest: 'a'.repeat(64),
    decision: 'approve',
  });
  original.stop();
  const recoveredRequest = jest
    .fn()
    .mockResolvedValue({ ...receipt(action.id, 'applied'), method: 'agent.interactions.respond' });
  const recovered = new RemoteAgentActions('pc:grant', port, recoveredRequest, () => {});
  await recovered.retry(action.id);
  expect(recovered.get()[0]).toMatchObject({ interactionId: 'approval', status: 'applied' });
  expect(recoveredRequest.mock.calls).toEqual([['agent.commands.get', { commandId: action.id }]]);
});

it('does not send when durable pre-send storage fails', async () => {
  const { storage, port } = journal();
  storage.write.mockImplementation(() => {
    throw new Error('disk full');
  });
  const request = jest.fn();
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  await expect(actions.create('send', method, params)).rejects.toThrow('disk full');
  expect(request).not.toHaveBeenCalled();
});

it('ignores late writes after the binding is retired', async () => {
  const { storage, port } = journal();
  let resolve!: (value: unknown) => void;
  const request = jest.fn(
    () =>
      new Promise<unknown>((done) => {
        resolve = done;
      }),
  );
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const sending = actions.create('send', method, params);
  const action = actions.get()[0];
  actions.dismiss(action.id);
  expect(actions.get()).toHaveLength(1);
  actions.stop();
  resolve(receipt(action.id, 'applied'));
  await sending;
  expect(storage.write).toHaveBeenCalledTimes(1);
  expect(new RemoteAgentActions('other:grant', port, request, () => {}).get()).toEqual([]);
});

const sessionResult = (id: string) => ({
  session: {
    sessionId: id,
    agentId: 'agent',
    workspaceId: 'workspace',
    title: '',
    updatedAt: '2026-09-22T00:00:00.000Z',
    historyRevision: '0',
    idleRevision: '1',
  },
});
const startInput = { draftId: 'draft', agentId: 'agent', workspaceId: 'workspace', text: 'hello' };

it('recovers both fixed start commands after create succeeded and the send response was lost', async () => {
  const { storage, port } = journal();
  const request = jest.fn(async (name: string, body: any) => {
    const stored = JSON.parse(storage.read('pc:grant')!);
    expect(stored.version).toBe(2);
    expect(stored.starts[0]).toMatchObject({
      createId: expect.any(String),
      sendId: expect.any(String),
    });
    if (name === 'agent.sessions.create')
      return { ...receipt(body.commandId, 'applied'), method: name };
    if (name === 'agent.sessions.get') return sessionResult('s');
    throw new RemoteAgentError('CONNECTION_LOST', true);
  });
  const original = new RemoteAgentActions('pc:grant', port, request, () => {});
  const start = await original.start(startInput);
  expect(start).toMatchObject({ status: 'pending', sessionId: 's', text: 'hello' });
  const sent = request.mock.calls.find(([name]) => name === method)![1];
  original.stop();
  const recovering = jest
    .fn()
    .mockRejectedValueOnce(new RemoteAgentError('NOT_FOUND'))
    .mockResolvedValueOnce(receipt(sent.commandId, 'applied'));
  const restored = new RemoteAgentActions('pc:grant', port, recovering, () => {});
  await restored.retry(start.id);
  expect(recovering.mock.calls).toEqual([
    ['agent.commands.get', { commandId: sent.commandId }],
    [method, sent],
  ]);
  expect(restored.getStarts()[0]).toMatchObject({ status: 'applied', sessionId: 's' });
});

it('deduplicates a start draft and preserves its created session and input after send rejection', async () => {
  const { port } = journal();
  const request = jest.fn(async (name: string, body: any) => {
    if (name === 'agent.sessions.get') return sessionResult('s');
    return { ...receipt(body.commandId, name === method ? 'rejected' : 'applied'), method: name };
  });
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const [first, second] = await Promise.all([actions.start(startInput), actions.start(startInput)]);
  expect(first.id).toBe(second.id);
  expect(first).toMatchObject({ status: 'rejected', sessionId: 's', text: 'hello' });
  await actions.retry(first.id);
  expect(request.mock.calls.map(([name]) => name)).toEqual([
    'agent.sessions.create',
    'agent.sessions.get',
    method,
  ]);
  await expect(actions.start({ ...startInput, text: 'different' })).rejects.toMatchObject({
    code: 'IDEMPOTENCY_CONFLICT',
  });
});

it('drops a journal this build cannot read instead of replaying or preserving it', async () => {
  const { storage, port } = journal();
  storage.write(
    'pc:grant',
    JSON.stringify({
      version: 1,
      records: [
        {
          action: { id: 'old', kind: 'send', status: 'confirming', sessionId: 's', text: 'old' },
          method,
          params: { ...params, commandId: 'old' },
        },
      ],
    }),
  );
  const request = jest.fn().mockRejectedValue(new RemoteAgentError('CONNECTION_LOST', true));
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  expect(actions.get()).toEqual([]);
  expect(storage.read('pc:grant')).toBeUndefined();
  await actions.start(startInput);
  expect(JSON.parse(storage.read('pc:grant')!)).toMatchObject({ version: 2 });
  expect(JSON.parse(storage.read('pc:grant')!).records.map((r: any) => r.action.id)).not.toContain(
    'old',
  );
});

it('retains uncertain workflows and dismisses both records only after a terminal result', async () => {
  const { storage, port } = journal();
  const request = jest.fn(async (name: string, body: any) => {
    if (name === 'agent.sessions.get') return sessionResult('s');
    return { ...receipt(body.commandId, name === method ? 'rejected' : 'applied'), method: name };
  });
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  const completed = await actions.start(startInput);
  actions.dismiss(completed.id);
  expect(actions.getStarts()).toEqual([]);
  expect(storage.read('pc:grant')).toBeUndefined();
  request.mockRejectedValue(new RemoteAgentError('CONNECTION_LOST', true));
  const pending = await actions.start({ ...startInput, draftId: 'another' });
  actions.dismiss(pending.id);
  expect(actions.getStarts()).toHaveLength(1);
});

it('restores the exact answer payload and target after process restart', async () => {
  const { port } = journal();
  const responseMethod = 'agent.interactions.respond';
  const params = {
    sessionId: 's',
    interactionId: 'question',
    expectedExecutionId: 'execution',
    expectedRevision: '3',
    inputDigest: 'a'.repeat(64),
    response: { kind: 'answer', answers: { '目录？': 'src 🌍' } },
  };
  const request = jest.fn().mockRejectedValue(new RemoteAgentError('CONNECTION_LOST', true));
  const original = new RemoteAgentActions('binding', port, request, () => {});
  const action = await original.create('respond', responseMethod, params);
  original.stop();
  const retry = jest
    .fn()
    .mockRejectedValueOnce(new RemoteAgentError('NOT_FOUND'))
    .mockResolvedValueOnce(receipt(action.id, 'applied', { method: responseMethod }));
  const restored = new RemoteAgentActions('binding', port, retry, () => {});
  await restored.retry(action.id);
  expect(retry.mock.calls).toEqual([
    ['agent.commands.get', { commandId: action.id }],
    [responseMethod, { ...params, commandId: action.id }],
  ]);
  expect(restored.get()[0].status).toBe('applied');
});

it('retains system workspace selection and create command identity through a lost create response', async () => {
  const { port } = journal();
  const request = jest.fn().mockRejectedValue(new RemoteAgentError('CONNECTION_LOST', true));
  const original = new RemoteAgentActions('binding', port, request, () => {});
  const start = await original.start({
    draftId: 'system-draft',
    agentId: 'agent',
    workspace: { kind: 'system' },
    text: 'hello',
  });
  const create = request.mock.calls[0][1];
  expect(create).toMatchObject({ workspace: { kind: 'system' } });
  expect(create).not.toHaveProperty('workspaceId');
  original.stop();
  const retry = jest.fn(async (name: string, body: any) => {
    if (name === 'agent.commands.get') throw new RemoteAgentError('NOT_FOUND');
    if (name === 'agent.sessions.get') return sessionResult('s');
    return receipt(body.commandId, 'applied', { method: name });
  });
  const restored = new RemoteAgentActions('binding', port, retry, () => {});
  await restored.retry(start.id);
  expect(retry.mock.calls.filter(([name]) => name === 'agent.sessions.create')).toEqual([
    ['agent.sessions.create', create],
  ]);
  expect(restored.getStarts()[0]).toMatchObject({
    status: 'applied',
    sessionId: 's',
    workspace: { kind: 'system' },
  });
});

// A rejection must keep the desktop explanation after reconnect and process restart.
it('retains command rejection details in the journal and recovered snapshots', async () => {
  const { port } = journal();
  const request = jest.fn(async (_method: string, body: any) =>
    receipt(body.commandId, 'rejected', {
      error: { reason: 'TARGET_UNAVAILABLE', message: 'Agent has no model configured' },
    }),
  );
  const original = new RemoteAgentActions('pc:grant', port, request, () => {});
  const action = await original.create('send', method, params);
  original.stop();
  const restored = new RemoteAgentActions('pc:grant', port, request, () => {});
  expect(restored.get()).toEqual([
    expect.objectContaining({
      id: action.id,
      status: 'failed',
      error: 'TARGET_UNAVAILABLE',
      errorMessage: 'Agent has no model configured',
    }),
  ]);
  await restored.retry(action.id);
  expect(request).toHaveBeenCalledTimes(1);
});

it('retains RPC rejection details for sends that never returned a command receipt', async () => {
  const { port } = journal();
  const request = jest
    .fn()
    .mockRejectedValue(
      new RemoteAgentError('TARGET_UNAVAILABLE', false, 'Agent has no model configured'),
    );
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  expect(await actions.create('send', method, params)).toMatchObject({
    status: 'failed',
    errorMessage: 'Agent has no model configured',
  });
});

it('recovers first-send diagnostics from an older journal receipt', async () => {
  const { port, storage } = journal();
  const request = jest.fn(async (name: string, body: any) => {
    if (name === 'agent.sessions.get') return sessionResult('s');
    return {
      ...receipt(
        body.commandId,
        name === method ? 'rejected' : 'applied',
        name === method
          ? { error: { reason: 'TARGET_UNAVAILABLE', message: 'Agent has no model configured' } }
          : {},
      ),
      method: name,
    };
  });
  const actions = new RemoteAgentActions('pc:grant', port, request, () => {});
  expect(await actions.start(startInput)).toMatchObject({
    status: 'rejected',
    errorMessage: 'Agent has no model configured',
  });
  actions.stop();
  const saved = JSON.parse(storage.read('pc:grant')!);
  for (const start of saved.starts) delete start.errorMessage;
  for (const entry of saved.records) delete entry.action.errorMessage;
  storage.write('pc:grant', JSON.stringify(saved));
  const restored = new RemoteAgentActions('pc:grant', port, request, () => {});
  expect(restored.getStarts()[0]).toMatchObject({
    status: 'rejected',
    errorMessage: 'Agent has no model configured',
  });
});
