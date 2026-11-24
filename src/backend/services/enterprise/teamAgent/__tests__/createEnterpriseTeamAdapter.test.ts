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
  [{ method: string; path: string; body?: unknown }]
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
  await expect(connection.submit(target, submission)).resolves.toBe('accepted');
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
    await expect(connection.submit(target, submission)).resolves.toBe('unknown');
    expect(mockRequest.mock.calls.filter(([request]) => request.method === 'POST')).toHaveLength(1);
  },
);

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
