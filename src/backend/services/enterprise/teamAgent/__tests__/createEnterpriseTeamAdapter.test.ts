import { fetch as expoFetch } from 'expo/fetch';

import { TeamAgentError } from '@/shared/contracts/teamAgent';

import { createEnterpriseTeamAdapter } from '../createEnterpriseTeamAdapter';

const employeeId = '11111111-1111-4111-8111-111111111111';
const agentId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const id = JSON.stringify([employeeId, agentId]);
const target = { agentId: id, sessionId };
const submission = { requestId: '44444444-4444-4444-8444-444444444444', input: 'hello' };
const mockRequest = jest.fn<
  Promise<{ data: unknown }>,
  [{ method: string; path: string; body?: unknown; signal?: AbortSignal }]
>();
jest.mock('../../enterpriseApi', () => ({ createEnterpriseRequest: () => mockRequest }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

async function fixture(runtimeKind: string, idempotentSubmit: boolean, messages: unknown[] = []) {
  let submits = 0;
  mockRequest.mockReset();
  mockRequest.mockImplementation(async ({ path, method }) => {
    if (path === '/ai-employees')
      return {
        data: [
          {
            id: employeeId,
            name: 'Employee',
            runtimeKind,
            status: 'ready',
            runtimeStatus: 'running',
            agents: [
              {
                id: agentId,
                name: 'Agent',
                description: '',
                status: 'ready',
                kind: 'main',
                portraitId: null,
              },
            ],
          },
        ],
      };
    if (path.endsWith('/sessions'))
      return { data: { sessions: [{ id: sessionId, channel: false, canDelete: true }] } };
    if (path.endsWith('/inputs') && method === 'POST') {
      if (++submits === 1) throw new TeamAgentError('offline');
      return { data: { requestId: submission.requestId, state: 'running' } };
    }
    if (path.includes('/inputs/'))
      return { data: { requestId: submission.requestId, state: 'missing' } };
    return { data: { messages, pending: [], run: null, canApprove: true, idempotentSubmit } };
  });
  const adapter = createEnterpriseTeamAdapter({
    getEnterpriseContext: () => ({
      key: 'context',
      profileId: 'profile',
      address: 'https://example.com',
      name: undefined,
    }),
    createEnterpriseSession: () => ({
      getProductToken: async () => 'token',
      refuseProductToken: async () => {},
      reportRejected: () => {},
    }),
    subscribe: () => () => {},
  });
  const connection = adapter.current()!;
  await connection.listAgents(new AbortController().signal);
  return connection;
}

it('retries an absent Astra input with exactly the original id only when idempotency is declared', async () => {
  const connection = await fixture('astra', true);
  mockRequest.mockClear();
  const { signal } = new AbortController();
  await expect(connection.submit(target, submission, signal)).resolves.toBe('accepted');
  expect(mockRequest).toHaveBeenCalledTimes(5);
  expect(mockRequest.mock.calls.every(([request]) => request.signal === signal)).toBe(true);
  const writes = mockRequest.mock.calls.filter(([request]) => request.method === 'POST');
  expect(writes.map(([request]) => request.body)).toEqual([submission, submission]);
});

it.each([
  ['hermes', true],
  ['astra', false],
])(
  'keeps uncertain %s submissions without automatically sending another POST',
  async (kind, idempotent) => {
    const connection = await fixture(kind as string, idempotent as boolean);
    await expect(connection.submit(target, submission, new AbortController().signal)).resolves.toBe(
      'unknown',
    );
    expect(mockRequest.mock.calls.filter(([request]) => request.method === 'POST')).toHaveLength(1);
  },
);

it.each(['preflight', 'post', 'recovery'] as const)(
  'retires an aborted submission during %s without any further requests',
  async (phase) => {
    const connection = await fixture('astra', true);
    const controller = new AbortController();
    const original = mockRequest.getMockImplementation()!;
    mockRequest.mockClear();
    mockRequest.mockImplementation(async (request) => {
      const { method, path, signal } = request;
      const abort =
        phase === 'preflight'
          ? path.endsWith(sessionId)
          : phase === 'post'
            ? method === 'POST'
            : path.endsWith(`/inputs/${submission.requestId}`);
      if (abort) {
        controller.abort();
        signal?.throwIfAborted();
      }
      return original(request);
    });

    await expect(connection.submit(target, submission, controller.signal)).rejects.toMatchObject({
      code: 'retired',
    });
    expect(mockRequest).toHaveBeenCalledTimes({ preflight: 2, post: 3, recovery: 4 }[phase]);
  },
);

it('refreshes cached session metadata once for a newly visible session', async () => {
  const connection = await fixture('astra', true);
  const { signal } = new AbortController();
  await connection.listSessions(id, signal);
  const nextId = '55555555-5555-4555-8555-555555555555';
  mockRequest.mockClear();
  mockRequest.mockResolvedValueOnce({ data: { sessions: [{ id: nextId, channel: false }] } });

  await expect(
    connection.readView({ ...target, sessionId: nextId }, signal),
  ).resolves.toMatchObject({
    canSend: true,
  });
  expect(mockRequest.mock.calls.map(([request]) => request.path)).toEqual([
    `/ai-employees/${employeeId}/agents/${agentId}/sessions`,
    `/ai-employees/${employeeId}/agents/${agentId}/sessions/${nextId}`,
  ]);
});

it('aborts the native fetch before cancelling the reader on a terminal snapshot', async () => {
  const connection = await fixture('astra', true);
  const run = { requestId: submission.requestId, state: 'done' };
  const frame = `data: ${JSON.stringify({
    type: 'snapshot',
    snapshot: { messages: [], pending: [], run, canApprove: false, idempotentSubmit: true },
  })}\n\n`;
  const read = jest.fn(async () => ({ done: false, value: new TextEncoder().encode(frame) }));
  const cancel = jest.fn(async () => {});
  let abortedAtCancel: boolean | undefined;
  jest.mocked(expoFetch).mockImplementationOnce(async (_url, options) => {
    cancel.mockImplementationOnce(async () => {
      abortedAtCancel = options?.signal?.aborted;
    });
    return {
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => ({ read, cancel }) },
    } as unknown as Awaited<ReturnType<typeof expoFetch>>;
  });
  const snapshot = jest.fn();
  const { signal } = new AbortController();
  await connection.watch(target, signal, snapshot);

  expect(snapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      run: { id: submission.requestId, state: 'done' },
    }),
  );
  expect(read).toHaveBeenCalledTimes(1);
  expect(abortedAtCancel).toBe(true);
  expect(signal.aborted).toBe(false);
});

it('does not grant actions to an unrecognized runtime', async () => {
  const connection = await fixture('future-runtime', true);
  const view = await connection.readView(target, new AbortController().signal);
  expect(view).toMatchObject({ canSend: false, canStop: false, canRespond: false });
});

it('keeps the text history and input available alongside Astra attachments and artifacts', async () => {
  const connection = await fixture('astra', true, [
    {
      id: 'question',
      role: 'user',
      parts: [
        { type: 'text', text: 'Compare these files.' },
        { type: 'data-image', data: { id: 1 } },
        { type: 'data-file', data: { id: 2, name: 'reference.csv' } },
      ],
    },
    {
      id: 'answer',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'The report is ready.' },
        {
          type: 'data-artifact',
          data: { requestId: submission.requestId, id: sessionId, name: 'report.csv' },
        },
      ],
    },
  ]);

  const view = await connection.readView(target, new AbortController().signal);

  expect(view.messages.map(({ parts }) => parts)).toEqual([
    [{ id: 'question:0', type: 'text', text: 'Compare these files.', state: 'done' }],
    [{ id: 'answer:0', type: 'text', text: 'The report is ready.', state: 'done' }],
  ]);
  expect(view.canSend).toBe(true);
});
