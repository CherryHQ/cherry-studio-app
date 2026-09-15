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
const config = {
  biz_type: 'doc',
  type: 'streamable-http',
  is_authed: true,
  url: 'https://qyapi.weixin.qq.com/mcp/bot/doc?key=private-key',
};
beforeEach(() => {
  mockRequest.mockReset();
  logger.warn.mockClear();
  jest.spyOn(Date, 'now').mockReturnValue(123000);
});
afterEach(() => jest.restoreAllMocks());

it('exposes the official phone confirmation URL and keeps the polling code separate', async () => {
  mockRequest.mockResolvedValue({
    data: {
      data: {
        scode: 'private-session',
        auth_url: 'https://work.weixin.qq.com/ai/qc/c?s=confirm',
      },
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
])('rejects confirmation outside the official phone route: %s', async (auth_url) => {
  mockRequest.mockResolvedValue({ data: { data: { scode: 'private-session', auth_url } } });
  await expect(wecomBotApi.begin(signal)).rejects.toMatchObject({ reason: 'request' });
});

it('signs the official MCP bootstrap and keeps the bot secret out of the request', async () => {
  mockRequest.mockResolvedValue({ data: { errcode: 0, list: [config] } });
  await expect(wecomBotApi.exchange(bot, 2, signal)).resolves.toMatchObject({
    version: 3,
    kind: 'bot',
    ...bot,
    connections: [{ category: 'doc', url: config.url }],
  });
  expect(digestStringAsync).toHaveBeenCalledWith(
    'SHA-256',
    'private-secretbot-1123mcp_123000_12345678',
  );
  const [base, request] = mockRequest.mock.calls[0];
  expect(base).toBe('https://qyapi.weixin.qq.com');
  expect(request).toMatchObject({
    path: '/cgi-bin/aibot/cli/get_mcp_config',
    redirect: 'error',
    body: {
      bot_id: 'bot-1',
      time: 123,
      nonce: 'mcp_123000_12345678',
      signature: 'signed-digest',
      bind_source: 2,
      cli_version: 'CherryStudio/WeComMcp',
    },
  });
  expect(JSON.stringify(request)).not.toContain('private-secret');
  expect(request.headers.Authorization).toBeUndefined();
});

it('retains newly authorized categories and omits explicitly unauthorized or unsupported entries', async () => {
  mockRequest.mockResolvedValue({
    data: {
      list: [
        config,
        { ...config, biz_type: 'mail', url: 'https://qyapi.weixin.qq.com/mcp/bot/mail?key=mail' },
        {
          ...config,
          biz_type: 'todo',
          url: 'https://qyapi.weixin.qq.com/mcp/bot/todo?key=todo',
          is_authed: false,
        },
        { ...config, biz_type: 'stdio', type: 'stdio', url: 'file:///executable' },
      ],
    },
  });
  const credential = await wecomBotApi.exchange(bot, 2, signal);
  expect(credential.connections.map(({ category }) => category)).toEqual(['doc', 'mail']);
});

it('accepts an existing enterprise bot whose doc service uses the official robot-doc endpoint', async () => {
  const url = 'https://qyapi.weixin.qq.com/mcp/robot-doc?apikey=private-enterprise-key';
  mockRequest.mockResolvedValue({ data: { errcode: 0, list: [{ ...config, url }] } });
  await expect(wecomBotApi.exchange(bot, 2, signal)).resolves.toMatchObject({
    version: 3,
    kind: 'bot',
    ...bot,
    connections: [{ category: 'doc', url }],
  });
});

it('keeps all signed categories when the second MCP path does not encode its biz_type', async () => {
  const url = 'https://qyapi.weixin.qq.com/mcp/services/calendar?key=private-schedule-key';
  mockRequest.mockResolvedValue({
    data: {
      errcode: 0,
      list: [config, { ...config, biz_type: 'schedule', url }],
    },
  });
  await expect(wecomBotApi.exchange(bot, 2, signal)).resolves.toMatchObject({
    connections: [
      { category: 'doc', url: config.url },
      { category: 'schedule', url },
    ],
  });
});

it('logs the failing authorization stage and schema locations without response values', async () => {
  mockRequest.mockResolvedValue({
    data: { list: [{ ...config, url: 'https://attacker.test?secret=private-secret' }] },
  });
  const error = await wecomBotApi.exchange(bot, 2, signal).catch((error: unknown) => error);
  expect(error).toMatchObject({
    reason: 'request',
    message: expect.stringContaining('mcp-config; connections.0.url'),
  });
  expect((error as Error).message).not.toContain('private-secret');
  expect(logger.warn).toHaveBeenCalledWith('Invalid Wecom authorization response.', {
    step: 'mcp-config',
    issues: expect.arrayContaining([expect.objectContaining({ path: ['connections', 0, 'url'] })]),
  });
  expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/private-|attacker/);
});

it.each([
  {
    errcode: 0,
    list: [{ ...config, url: 'https://attacker.test/mcp/bot/doc?secret=private-secret' }],
  },
  { errcode: 0, list: [config, config] },
  { errcode: 0, list: [] },
  { errcode: 853001, errmsg: 'private-upstream-message' },
])(
  'rejects untrusted or unusable configurations without exposing upstream data',
  async (response) => {
    mockRequest.mockResolvedValue({ data: response });
    await expect(wecomBotApi.exchange(bot, 2, signal)).rejects.toMatchObject({
      name: 'PluginError',
      message: expect.not.stringMatching(/private-/),
    });
  },
);
