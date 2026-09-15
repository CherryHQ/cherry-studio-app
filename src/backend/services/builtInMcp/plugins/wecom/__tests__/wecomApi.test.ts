import type { PluginClientContext } from '../../../pluginDefinition';
import { createWecomApi, readWecomResult, type WecomApiRequest } from '../wecomApi';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (input: unknown) => mockRequest(input) }),
  isHttpError: (error: { kind?: string }) => !!error?.kind,
}));

const encoded = (data: unknown) => ({
  data: new TextEncoder().encode(JSON.stringify(data)).buffer,
  status: 200,
  headers: { 'content-type': 'application/json' },
});
const result = (value: unknown) =>
  encoded({ errcode: 0, results_json: JSON.stringify({ result: JSON.stringify(value) }) });
let credential = {
  version: 1,
  botId: 'bot-1',
  secret: 'private-secret',
  token: 'private-token',
};
let context: PluginClientContext;
let api: ReturnType<typeof createWecomApi>;
const input = (effect: 'read' | 'write' = 'read'): WecomApiRequest => ({
  endpoint: { path: '/cli/todo/list' },
  payload: { limit: 2 },
  signal: new AbortController().signal,
  effect,
});
beforeEach(() => {
  mockRequest.mockReset();
  credential = { ...credential, botId: 'bot-1', token: 'private-token' };
  context = {
    pluginId: 'wecom',
    tools: {},
    signal: new AbortController().signal,
    getCredential: jest.fn(async () => credential),
    assertAuthorized: jest.fn(async () => {}),
    rejectCredential: jest.fn(async () => {
      credential = { ...credential, token: 'renewed-token' };
    }),
    authorization: {
      apply: (value, { headers }) => {
        headers.set('Authorization', `Bearer ${(value as typeof credential).token}`);
      },
    },
  };
  api = createWecomApi(context, 'bot-1');
});
afterEach(() => jest.useRealTimers());

it('uses the CLI gateway envelope, token header and native response-size boundary', async () => {
  mockRequest.mockResolvedValue(result({ items: [1, 2], next_cursor: 'next' }));
  expect(readWecomResult(await api.call(input()))).toEqual({ items: [1, 2], next_cursor: 'next' });
  expect(mockRequest.mock.calls[0][0]).toMatchObject({
    path: '/cli/todo/list',
    method: 'POST',
    body: { payload: '{"limit":2}' },
    headers: { authorization: 'Bearer private-token' },
    responseType: 'arraybuffer',
    redirect: 'error',
    maxResponseBytes: 64 * 1024 * 1024,
  });
  expect(JSON.stringify(mockRequest.mock.calls)).not.toContain('private-secret');
});

it('retries a rejected read with the refreshed token', async () => {
  mockRequest
    .mockResolvedValueOnce(encoded({ errcode: 853004 }))
    .mockResolvedValueOnce(result({ ok: true }));
  expect(readWecomResult(await api.call(input()))).toEqual({ ok: true });
  expect(context.rejectCredential).toHaveBeenCalledTimes(1);
  expect(mockRequest.mock.calls.map(([request]) => request.headers.authorization)).toEqual([
    'Bearer private-token',
    'Bearer renewed-token',
  ]);
});

it('stops after the refreshed read is rejected without making a third request', async () => {
  mockRequest
    .mockResolvedValueOnce(encoded({ errcode: 853004 }))
    .mockResolvedValueOnce(encoded({ errcode: 853004 }))
    .mockResolvedValue(result({ ok: true }));
  await expect(api.call(input())).rejects.toMatchObject({ reason: 'authorization' });
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

it('refreshes an expired write credential without replaying the write', async () => {
  mockRequest.mockResolvedValue(encoded({ errcode: 853004 }));
  await expect(api.call(input('write'))).rejects.toMatchObject({ reason: 'authorization' });
  expect(context.rejectCredential).toHaveBeenCalledTimes(1);
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it.each([new Error('private-network-error'), { kind: 'network', status: 503 }])(
  'reports an uncertain write without exposing or replaying the failure',
  async (error) => {
    mockRequest.mockRejectedValue(error);
    await expect(api.call(input('write'))).rejects.toMatchObject({
      reason: 'unknown-write',
      message: expect.not.stringContaining('private-'),
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);

it('rejects both gateway and nested business errors without returning success or upstream messages', async () => {
  mockRequest.mockResolvedValueOnce(encoded({ errcode: 853001, errmsg: 'private-upstream' }));
  await expect(api.call(input())).rejects.toMatchObject({
    reason: 'request',
    message: expect.stringContaining('853001'),
  });
  mockRequest.mockResolvedValueOnce(
    encoded({ results_json: JSON.stringify({ error: { code: 12, message: 'private-upstream' } }) }),
  );
  await expect(api.call(input())).rejects.toMatchObject({
    reason: 'request',
    message: expect.not.stringContaining('private-upstream'),
  });
});

it.each([0, 1] as const)(
  'polls mode %s using the returned task ID without resubmitting business content',
  async (mode) => {
    jest.useFakeTimers();
    mockRequest
      .mockResolvedValueOnce(
        encoded({ results_json: JSON.stringify({ taskid: 'task-1', poll_mode: mode }) }),
      )
      .mockResolvedValueOnce(
        encoded({
          results_json: JSON.stringify({ result: '{"ok":true}', long_task_poll: { done: true } }),
        }),
      );
    const pending = api.call(input('write'));
    await jest.advanceTimersByTimeAsync(500);
    expect(readWecomResult(await pending)).toEqual({ ok: true });
    expect(mockRequest).toHaveBeenCalledTimes(2);
    const poll = mockRequest.mock.calls[1][0];
    if (mode === 0) {
      expect(poll.path).toBe('/cli/task/query');
      expect(JSON.parse(poll.body.payload)).toEqual({
        method: 'PollClawLongTask',
        payload: '{"taskid":"task-1"}',
      });
    } else {
      expect(poll.path).toBe('/cli/todo/list');
      expect(poll.headers['x-long-poll-taskid']).toBe('task-1');
      expect(poll.body).toEqual({ payload: '{}' });
    }
  },
);

it('assembles declared range downloads and preserves binary bytes', async () => {
  mockRequest
    .mockResolvedValueOnce({
      data: new Uint8Array([0, 255]).buffer,
      status: 206,
      headers: { 'content-type': 'application/pdf', 'content-range': 'bytes 0-1/3' },
    })
    .mockResolvedValueOnce({
      data: new Uint8Array([127]).buffer,
      status: 206,
      headers: { 'content-type': 'application/pdf', 'content-range': 'bytes 2-2/3' },
    });
  const output = await api.call({
    ...input(),
    endpoint: { path: '/cli/disk/download', rangeSize: 2 },
  });
  expect(output).toMatchObject({
    kind: 'file',
    bytes: new Uint8Array([0, 255, 127]),
    partial: false,
  });
  expect(mockRequest.mock.calls.map(([request]) => request.headers.range)).toEqual([
    'bytes=0-1',
    'bytes=2-3',
  ]);
});

it('keeps a started write uncertain if long-task polling is interrupted', async () => {
  jest.useFakeTimers();
  const controller = new AbortController();
  mockRequest.mockResolvedValueOnce(
    encoded({
      results_json: JSON.stringify({ taskid: 'task-1', poll_mode: 1 }),
    }),
  );
  const pending = api.call({ ...input('write'), signal: controller.signal });
  const outcome = expect(pending).rejects.toMatchObject({ reason: 'unknown-write' });
  await jest.advanceTimersByTimeAsync(1);
  controller.abort();
  await outcome;
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it('does not send after identity replacement, revoked access, cancellation or an untrusted URL', async () => {
  credential = { ...credential, botId: 'other-bot' };
  await expect(api.call(input())).rejects.toMatchObject({ reason: 'authorization' });
  credential = { ...credential, botId: 'bot-1' };
  const controller = new AbortController();
  controller.abort();
  await expect(api.call({ ...input(), signal: controller.signal })).rejects.toMatchObject({
    reason: 'cancelled',
  });
  await expect(
    api.call({
      ...input(),
      endpoint: { path: 'https://attacker.test/cli/todo/list' },
    }),
  ).rejects.toMatchObject({ reason: 'access' });
  jest.mocked(context.assertAuthorized).mockRejectedValueOnce(new Error('revoked'));
  await expect(api.call(input())).rejects.toBeDefined();
  expect(mockRequest).not.toHaveBeenCalled();
});
