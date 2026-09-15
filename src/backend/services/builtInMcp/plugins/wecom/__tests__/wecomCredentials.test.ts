import { readWecomCredential } from '../wecomCredentials';
import { wecomPlugin } from '../wecomPlugin';

jest.mock('../createWecomClient', () => ({ createWecomClient: jest.fn() }));

const credential = {
  version: 4,
  kind: 'bot',
  botId: 'bot-1',
  secret: 'private-secret',
  token: 'private-token',
};

it('stores a versioned bot and gateway token without keeping old MCP URLs', () => {
  expect(readWecomCredential({ ...credential, connections: ['old-url'] })).toEqual(credential);
});

it.each([
  {
    version: 3,
    kind: 'bot',
    botId: 'bot-1',
    secret: 'old-secret',
    configId: 'old',
    connections: [],
  },
  { version: 3, kind: 'mcp', connections: [] },
  { ...credential, token: '' },
  { ...credential, token: 'token\r\nHeader: injected' },
])('requires reconnection for obsolete or invalid grants', (value) => {
  expect(() => readWecomCredential(value)).toThrow('Reconnect Wecom');
});

it('only offers the current authorization flow and binds its token to the official gateway', async () => {
  expect(wecomPlugin.authMethods.map(({ id }) => id)).toEqual(['wecom_bot']);
  const authorization = wecomPlugin.authMethods[0].createRequestAuthorization(wecomPlugin.tools);
  const headers = new Headers();
  const url = new URL('https://qyapi.weixin.qq.com/cli/service/discovery');
  await authorization.apply(credential, { url, headers });
  expect(headers.get('Authorization')).toBe('Bearer private-token');
  expect(url.search).toBe('');
  for (const target of [
    'https://attacker.test/cli/doc/get',
    'https://qyapi.weixin.qq.com/mcp/bot/doc',
    'https://qyapi.weixin.qq.com/cli/doc/get?token=private',
  ]) {
    expect(() =>
      authorization.apply(credential, { url: new URL(target), headers: new Headers() }),
    ).toThrow('Untrusted');
  }
});
