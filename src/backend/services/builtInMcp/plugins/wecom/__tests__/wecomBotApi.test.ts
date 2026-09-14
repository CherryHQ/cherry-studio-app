import { digestStringAsync } from 'expo-crypto';

import { wecomBotApi } from '../wecomBotApi';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
  isHttpError: () => false,
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async () => 'signed-digest'),
  randomUUID: () => '12345678-1234-4000-8000-123456789012',
}));
const signal = new AbortController().signal;
beforeEach(() => {
  mockRequest.mockReset();
  jest.spyOn(Date, 'now').mockReturnValue(123000);
});
afterEach(() => jest.restoreAllMocks());

it('exposes the phone confirmation URL and keeps the independent polling code private', async () => {
  mockRequest.mockResolvedValue({
    data: {
      data: { scode: 'private-session', auth_url: 'https://work.weixin.qq.com/ai/qc/c?s=confirm' },
    },
  });
  const challenge = await wecomBotApi.begin(signal);
  expect(challenge).toMatchObject({
    sessionCode: 'private-session',
    verificationUrl: 'https://work.weixin.qq.com/ai/qc/c?s=confirm',
    expiresAt: 423000,
  });
  expect(mockRequest.mock.calls[0]).toEqual([
    'https://work.weixin.qq.com',
    expect.objectContaining({
      method: 'GET',
      path: '/ai/qc/generate',
      query: { source: 'wecom_cli_external', plat: '0' },
      redirect: 'error',
    }),
  ]);
});

it.each([
  'https://attacker.test/ai/qc/c?s=confirm',
  'https://work.weixin.qq.com/ai/qc/gen?s=confirm',
])('rejects a confirmation URL outside the phone authorization route: %s', async (auth_url) => {
  mockRequest.mockResolvedValue({ data: { data: { scode: 'private-session', auth_url } } });
  await expect(wecomBotApi.begin(signal)).rejects.toMatchObject({ reason: 'request' });
});

it('signs the official bootstrap payload without sending the bot secret or a stale token', async () => {
  mockRequest.mockResolvedValue({ data: { errcode: 0, token: 'new-token' } });
  await expect(
    wecomBotApi.exchange({ botId: 'bot-1', secret: 'private-secret' }, 2, signal),
  ).resolves.toMatchObject({ version: 2, token: 'new-token' });
  expect(digestStringAsync).toHaveBeenCalledWith(
    'SHA-256',
    'private-secretbot-1123cli_123000_12345678',
  );
  const [base, request] = mockRequest.mock.calls[0];
  expect(base).toBe('https://qyapi.weixin.qq.com');
  expect(request.path).toBe('/cgi-bin/aibot/cli/get_cli_config');
  expect(request.body).toEqual({
    bot_id: 'bot-1',
    time: 123,
    nonce: 'cli_123000_12345678',
    signature: 'signed-digest',
    bind_source: 2,
  });
  expect(request.headers.Authorization).toBeUndefined();
  expect(JSON.stringify(request)).not.toContain('private-secret');
});

it('encodes and decodes the CLI gateway envelopes and preserves explicit token rejection', async () => {
  mockRequest.mockResolvedValueOnce({
    data: { errcode: 0, results_json: JSON.stringify({ result: JSON.stringify({ items: [] }) }) },
  });
  await expect(
    wecomBotApi.invoke('/cli/service/discovery', { service: 'todo' }, 'token', signal),
  ).resolves.toEqual({ items: [] });
  expect(mockRequest.mock.calls[0][1]).toMatchObject({
    headers: { Authorization: 'Bearer token' },
    body: { payload: '{"service":"todo"}' },
    redirect: 'error',
  });
  mockRequest.mockResolvedValueOnce({
    data: { errcode: 853004, errmsg: 'private-upstream-message' },
  });
  await expect(wecomBotApi.invoke('/cli/todo/list', {}, 'token', signal)).rejects.toMatchObject({
    code: 853004,
    message: 'Wecom rejected the request.',
  });
});

it.each([0, 1])(
  'waits for an accepted task using the official polling mode %s',
  async (poll_mode) => {
    const wrapped = (inner: unknown) => ({
      data: { errcode: 0, results_json: JSON.stringify(inner) },
    });
    mockRequest.mockResolvedValueOnce(wrapped({ taskid: 'task-1', poll_mode }));
    mockRequest.mockResolvedValueOnce(
      wrapped({ long_task_poll: { done: true }, result: '{"success":true}' }),
    );
    await expect(
      wecomBotApi.invoke('/cli/todo/create', { title: 'Task' }, 'token', signal),
    ).resolves.toEqual({ success: true });
    const polling = mockRequest.mock.calls[1][1];
    expect(polling.path).toBe(poll_mode ? '/cli/todo/create' : '/cli/task/query');
    expect(JSON.parse(polling.body.payload)).toEqual(
      poll_mode ? {} : { method: 'PollClawLongTask', payload: '{"taskid":"task-1"}' },
    );
    expect(polling.headers['X-Long-Poll-TaskId']).toBe(poll_mode ? 'task-1' : undefined);
  },
);

it('does not classify an expired token during task polling as a replayable initial rejection', async () => {
  mockRequest.mockResolvedValueOnce({ data: { errcode: 0, results_json: '{"taskid":"task-1"}' } });
  mockRequest.mockResolvedValueOnce({ data: { errcode: 853004 } });
  await expect(wecomBotApi.invoke('/cli/todo/create', {}, 'token', signal)).rejects.toMatchObject({
    reason: 'request',
    message: 'Could not confirm the Wecom task result. Check Wecom before retrying.',
  });
  expect(mockRequest).toHaveBeenCalledTimes(2);
});
