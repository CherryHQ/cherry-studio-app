import type { ListToolsResult } from '@ai-sdk/mcp';

import type { PluginClientContext } from '../../../pluginDefinition';
import { createOfficialMcpClient } from '../../../transport/createOfficialMcpClient';
import { createWecomClient } from '../createWecomClient';
import { parseWecomConfig, WecomEndpointSchema } from '../wecomCredentials';
import { WECOM_TOOL_POLICY } from '../wecomTools';

jest.mock('../../../transport/createOfficialMcpClient');
const createRemote = jest.mocked(createOfficialMcpClient);
const url = 'https://qyapi.weixin.qq.com/mcp/b/todo?key=private-key';
const secondUrl = 'https://qyapi.weixin.qq.com/mcp/b/schedule?key=other-key';
const read = 'get_todo_list';
const write = 'create_todo';
const signal = new AbortController().signal;
const definition = (name: string, readOnlyHint = false) => ({
  name,
  description: name,
  inputSchema: { type: 'object' as const },
  annotations: { readOnlyHint },
});
function fixture() {
  const credential = parseWecomConfig(url);
  const context: PluginClientContext = {
    pluginId: 'wecom',
    tools: WECOM_TOOL_POLICY,
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
  const config = parseWecomConfig(
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
    expect(WecomEndpointSchema.safeParse(bad).success).toBe(false);
  expect(() =>
    parseWecomConfig(JSON.stringify({ url, command: 'node', args: ['script.js'] })),
  ).toThrow();
  expect(() =>
    parseWecomConfig(JSON.stringify({ url, headers: { Cookie: 'private-cookie' } })),
  ).toThrow();
  expect(() =>
    parseWecomConfig(JSON.stringify({ mcpServers: { one: { url }, two: { url } } })),
  ).toThrow();
});

it('discovers schemas but admits only reviewed tools and enforces bundled write effects', async () => {
  const { context, remote, credential } = fixture();
  const client = await createWecomClient(context);
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
  const client = await createWecomClient(context);
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
  const client = await createWecomClient(context);
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
  const client = await createWecomClient(context);
  await client.listTools();
  jest.mocked(context.getCredential).mockResolvedValue(parseWecomConfig(secondUrl));
  await expect(client.callTool({ name: read, args: {} })).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(remote.callTool).not.toHaveBeenCalled();
  await client.close();
});

it('allows completion and reopening but rejects deletion through the update endpoint', async () => {
  const { context, remote } = fixture();
  remote.listTools.mockResolvedValue({ tools: [definition('update_todo')] });
  const client = await createWecomClient(context);
  const catalog = await client.listTools();
  expect(catalog.tools[0].inputSchema.properties?.todo_status).toMatchObject({ enum: [0, 1] });
  for (const todoStatus of [2, '2', null, true]) {
    await expect(
      client.callTool({
        name: 'update_todo',
        args: { todo_id: 'td-existing', todo_status: todoStatus },
      }),
    ).rejects.toMatchObject({ reason: 'request' });
  }
  expect(remote.callTool).not.toHaveBeenCalled();
  for (const todoStatus of [0, 1]) {
    await client.callTool({
      name: 'update_todo',
      args: { todo_id: 'td-existing', todo_status: todoStatus },
    });
  }
  expect(remote.callTool).toHaveBeenCalledTimes(2);
  await client.close();
});
