import type { ListToolsResult } from '@ai-sdk/mcp';

import type { PluginClientContext } from '../../../pluginDefinition';
import { createOfficialMcpClient } from '../../../transport/createOfficialMcpClient';
import { createDingtalkClient } from '../createDingtalkClient';
import { parseDingtalkConfig, DingtalkEndpointSchema } from '../dingtalkCredentials';
import { DINGTALK_TOOL_POLICY } from '../dingtalkTools';

jest.mock('../../../transport/createOfficialMcpClient');
const createRemote = jest.mocked(createOfficialMcpClient);
const url =
  'https://mcp-gw.dingtalk.com/server/0f51140eddcd913106c5821a4d0cd577b2d1a0b6cb452dd0e51ab41facf3a83c?key=private-key';
const secondUrl =
  'https://mcp-gw.dingtalk.com/server/3cb83d4ac411227c44c1abde4e4bfbae0ea2c172b83a78a33ffc3821d0d1be47?key=other-key';
const read = 'get_todo_detail';
const write = 'create_personal_todo';
const signal = new AbortController().signal;
const definition = (name: string, readOnlyHint = false) => ({
  name,
  description: name,
  inputSchema: { type: 'object' as const },
  annotations: { readOnlyHint },
});
function fixture() {
  const credential = parseDingtalkConfig(url);
  const context: PluginClientContext = {
    pluginId: 'dingtalk',
    tools: DINGTALK_TOOL_POLICY,
    signal,
    getCredential: jest.fn(async () => credential),
    assertAuthorized: jest.fn(async () => {}),
    authorization: { apply() {} },
  };
  const remote = {
    serverInfo: { name: 'Official', version: '1' },
    listTools: jest.fn(
      async (): Promise<ListToolsResult> => ({
        tools: [definition(read), definition(write, true), definition('send_unreviewed_message')],
      }),
    ),
    callTool: jest.fn(async () => ({ content: [{ type: 'text' as const, text: '{"ok":true}' }] })),
    close: jest.fn(async () => {}),
  };
  createRemote.mockResolvedValue(remote);
  return { context, remote, credential };
}
beforeEach(() => createRemote.mockReset());

it('imports credentials without accepting executable configuration or another origin', () => {
  const config = parseDingtalkConfig(
    JSON.stringify({
      mcpServers: {
        office: {
          type: 'streamable-http',
          url,
          headers: { Authorization: 'Bearer private-token' },
        },
      },
    }),
  );
  expect(config.connections).toEqual([{ url, headers: { authorization: 'Bearer private-token' } }]);
  for (const bad of [
    url.replace('https:', 'http:'),
    url.replace(new URL(url).hostname, 'attacker.invalid'),
    url + '#fragment',
  ])
    expect(DingtalkEndpointSchema.safeParse(bad).success).toBe(false);
  expect(() =>
    parseDingtalkConfig(JSON.stringify({ url, command: 'node', args: ['script.js'] })),
  ).toThrow();
  expect(() =>
    parseDingtalkConfig(JSON.stringify({ url, headers: { Cookie: 'private-cookie' } })),
  ).toThrow();
  expect(() =>
    parseDingtalkConfig(JSON.stringify({ mcpServers: { one: { url }, two: { url } } })),
  ).toThrow();
});

it('discovers schemas but admits only reviewed tools and enforces bundled write effects', async () => {
  const { context, remote, credential } = fixture();
  const client = await createDingtalkClient(context);
  const result = await client.listTools();
  expect(result.tools.map((tool) => tool.name)).toEqual([read, write]);
  expect(result.tools[1].annotations?.readOnlyHint).toBe(false);
  expect(remote.callTool).not.toHaveBeenCalled();
  await expect(
    client.callTool({ name: 'send_unreviewed_message', args: {} }),
  ).rejects.toMatchObject({ reason: 'access' });
  await client.callTool({ name: read, args: {} });
  expect(remote.callTool).toHaveBeenCalledTimes(1);
  const [bound, connection] = createRemote.mock.calls[0];
  expect(connection.url).toBe(url);
  await expect(
    bound.authorization.apply(
      { ...credential, connections: [{ url: secondUrl }] },
      { url: new URL(url), headers: new Headers() },
    ),
  ).rejects.toMatchObject({ reason: 'authorization' });
  await client.close();
  expect(remote.close).toHaveBeenCalledTimes(1);
});

it('does not silently retry an ambiguous write or expose transport secrets', async () => {
  const { context, remote } = fixture();
  const client = await createDingtalkClient(context);
  await client.listTools();
  remote.callTool.mockRejectedValue(new Error('Failed request at ' + url));
  await expect(client.callTool({ name: write, args: {} })).rejects.toMatchObject({
    reason: 'unknown-write',
  });
  expect(remote.callTool).toHaveBeenCalledTimes(1);
  await client.close();
});

it('rejects repeated pagination without publishing a partial routing snapshot', async () => {
  const { context, remote } = fixture();
  remote.listTools
    .mockResolvedValueOnce({ tools: [definition(read)], nextCursor: 'same-cursor' })
    .mockResolvedValue({ tools: [], nextCursor: 'same-cursor' });
  const client = await createDingtalkClient(context);
  await expect(client.listTools()).rejects.toMatchObject({ reason: 'request' });
  expect(remote.listTools).toHaveBeenCalledTimes(2);
  await expect(client.callTool({ name: read, args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  expect(remote.callTool).not.toHaveBeenCalled();
  await client.close();
});

it('stops using the captured endpoint when the stored grant changes', async () => {
  const { context, remote } = fixture();
  const client = await createDingtalkClient(context);
  await client.listTools();
  jest.mocked(context.getCredential).mockResolvedValue(parseDingtalkConfig(secondUrl));
  await expect(client.callTool({ name: read, args: {} })).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(remote.callTool).not.toHaveBeenCalled();
  await client.close();
});
