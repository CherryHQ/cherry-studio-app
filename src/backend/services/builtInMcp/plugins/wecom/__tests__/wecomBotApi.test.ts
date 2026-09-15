import { loggerService } from '@logger';
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
jest.mock('@logger', () => {
  const logger = { warn: jest.fn() };
  return { loggerService: { withContext: () => logger } };
});
const logger = jest.mocked(loggerService.withContext('WecomAuthorization'));
const signal = new AbortController().signal;
const bot = { botId: 'bot-1', secret: 'private-secret' };
beforeEach(() => {
  mockRequest.mockReset();
  logger.warn.mockClear();
  jest.spyOn(Date, 'now').mockReturnValue(123000);
});
afterEach(() => jest.restoreAllMocks());

it('keeps the polling secret separate from the official phone confirmation URL', async () => {
  mockRequest.mockResolvedValue({
    data: {
      data: { scode: 'private-session', auth_url: 'https://work.weixin.qq.com/ai/qc/c?s=confirm' },
    },
  });
  expect(await wecomBotApi.begin(signal)).toMatchObject({
    sessionCode: 'private-session',
    verificationUrl: 'https://work.weixin.qq.com/ai/qc/c?s=confirm',
    expiresAt: 423000,
  });
  expect(mockRequest.mock.calls[0]).toEqual([
    'https://work.weixin.qq.com',
    expect.objectContaining({
      method: 'GET',
      path: '/ai/qc/generate',
      redirect: 'error',
      query: { source: 'wecom_cli_external', plat: '0' },
    }),
  ]);
});

it.each([
  'https://attacker.test/ai/qc/c?s=confirm',
  'https://work.weixin.qq.com/ai/qc/gen?s=confirm',
])('rejects untrusted confirmation URLs', async (auth_url) => {
  mockRequest.mockResolvedValue({ data: { data: { scode: 'private-session', auth_url } } });
  await expect(wecomBotApi.begin(signal)).rejects.toMatchObject({ reason: 'request' });
});

it('reads bot identity from the current official polling response', async () => {
  mockRequest.mockResolvedValue({
    data: { data: { status: 'success', bot_info: { botid: bot.botId, secret: bot.secret } } },
  });
  await expect(wecomBotApi.poll('private-session', signal)).resolves.toEqual(bot);
});

it('signs get_cli_config and stores the returned token without sending the bot secret', async () => {
  mockRequest.mockResolvedValue({ data: { errcode: 0, token: 'private-token' } });
  await expect(wecomBotApi.exchange(bot, 2, signal)).resolves.toEqual({
    version: 1,
    ...bot,
    token: 'private-token',
  });
  expect(digestStringAsync).toHaveBeenCalledWith(
    'SHA-256',
    'private-secretbot-1123cli_123000_12345678',
  );
  const [base, request] = mockRequest.mock.calls[0];
  expect(base).toBe('https://qyapi.weixin.qq.com');
  expect(request).toMatchObject({
    path: '/cgi-bin/aibot/cli/get_cli_config',
    redirect: 'error',
    body: {
      bot_id: 'bot-1',
      time: 123,
      nonce: 'cli_123000_12345678',
      signature: 'signed-digest',
      bind_source: 2,
    },
  });
  expect(JSON.stringify(request)).not.toContain('private-secret');
  expect(request.headers.Authorization).toBeUndefined();
});

it('logs schema locations without leaking rejected token values', async () => {
  mockRequest.mockResolvedValue({ data: { token: { value: 'private-token' } } });
  await expect(wecomBotApi.exchange(bot, 2, signal)).rejects.toMatchObject({
    reason: 'request',
    message: expect.stringContaining('cli-credential; token'),
  });
  expect(logger.warn).toHaveBeenCalledWith('Invalid Wecom authorization response.', {
    step: 'cli-credential',
    issues: expect.arrayContaining([expect.objectContaining({ path: ['token'] })]),
  });
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-token');
});

it.each([
  { errcode: 0 },
  { errcode: 0, token: '' },
  { errcode: 853001, errmsg: 'private-upstream' },
])(
  'rejects unusable authorization responses without disclosing upstream data',
  async (response) => {
    mockRequest.mockResolvedValue({ data: response });
    await expect(wecomBotApi.exchange(bot, 2, signal)).rejects.toMatchObject({
      name: 'PluginError',
      message: expect.not.stringContaining('private-'),
    });
  },
);
