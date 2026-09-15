import { importWecomMcpConfig, readWecomCredential } from '../wecomCredentials';
import { wecomPlugin } from '../wecomPlugin';

const docUrl = 'https://qyapi.weixin.qq.com/mcp/bot/doc?key=private-doc-key';
const mailUrl = 'https://qyapi.weixin.qq.com/mcp/bot/mail?key=private-mail-key';

it('imports official URLs and multi-service JSON using URL categories instead of display labels', () => {
  expect(importWecomMcpConfig(docUrl)).toEqual({
    version: 3,
    kind: 'mcp',
    connections: [{ category: 'doc', url: docUrl }],
  });
  expect(
    importWecomMcpConfig(
      JSON.stringify({
        mcpServers: {
          企业微信文档: { type: 'streamable-http', url: docUrl },
          'Arbitrary display label': { type: 'http', url: mailUrl },
        },
      }),
    ).connections,
  ).toEqual([
    { category: 'doc', url: docUrl },
    { category: 'mail', url: mailUrl },
  ]);
});

it.each([
  'https://qyapi.weixin.qq.com.attacker.test/mcp/bot/doc?key=secret',
  'http://qyapi.weixin.qq.com/mcp/bot/doc?key=secret',
  'https://qyapi.weixin.qq.com:444/mcp/bot/doc?key=secret',
  'https://name:password@qyapi.weixin.qq.com/mcp/bot/doc?key=secret',
  `${docUrl}#fragment`,
  'https://qyapi.weixin.qq.com/cli/doc/create?key=secret',
  'https://qyapi.weixin.qq.com/mcp/bot/doc%2fmail?key=secret',
  '{"mcpServers":{"local":{"command":"node","args":["server.js"]}}}',
  JSON.stringify({ url: docUrl, headers: { Authorization: 'custom-secret' } }),
  JSON.stringify({ mcpServers: { first: { url: docUrl }, second: { url: `${docUrl}2` } } }),
  '{"mcpServers":{}}',
])('rejects nonofficial or ambiguous imports: %s', (value) => {
  expect(() => importWecomMcpConfig(value)).toThrow('Paste an official Wecom MCP URL');
});

it('injects each service credential only into its matching official request', async () => {
  const credential = importWecomMcpConfig(
    JSON.stringify({
      mcpServers: {
        doc: { url: docUrl },
        mail: { url: mailUrl },
      },
    }),
  );
  const authorization = wecomPlugin.authMethods[1].createRequestAuthorization(wecomPlugin.tools);
  const url = new URL('https://qyapi.weixin.qq.com/mcp/bot/mail');
  const headers = new Headers();
  await authorization.apply(credential, { url, headers });
  expect(url.href).toBe(mailUrl);
  expect(headers.get('Authorization')).toBeNull();
  expect(() =>
    authorization.apply(credential, {
      url: new URL('https://attacker.test/mcp/bot/mail'),
      headers,
    }),
  ).toThrow('not authorized');
});

it('requires reconnection for earlier CLI credentials and mismatched service routes', () => {
  expect(() =>
    readWecomCredential({ version: 2, botId: 'bot', secret: 'secret', token: 'token' }),
  ).toThrow('Reconnect Wecom');
  expect(() =>
    readWecomCredential({
      version: 3,
      kind: 'mcp',
      connections: [{ category: 'mail', url: docUrl }],
    }),
  ).toThrow('Reconnect Wecom');
});
