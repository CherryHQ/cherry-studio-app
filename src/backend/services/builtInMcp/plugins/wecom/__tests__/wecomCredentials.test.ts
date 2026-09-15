import { PluginError } from '@/shared/contracts/plugins';

import { readWecomCredential } from '../wecomCredentials';
import { wecomPlugin } from '../wecomPlugin';

jest.mock('../createWecomClient', () => ({ createWecomClient: jest.fn() }));

const credential = {
  version: 1,
  botId: 'bot-1',
  secret: 'private-secret',
  token: 'private-token',
};

it.each([
  { ...credential, token: '' },
  { ...credential, token: 'token\r\nHeader: injected' },
])('rejects invalid gateway tokens', (value) => {
  expect(() => readWecomCredential(value)).toThrow(PluginError);
});

it('binds its token to the official gateway', async () => {
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
