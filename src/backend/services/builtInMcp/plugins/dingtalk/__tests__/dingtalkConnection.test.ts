import type { ListToolsResult } from '@ai-sdk/mcp';

import type { PluginClientContext } from '../../../pluginDefinition';
import { createOfficialMcpClient } from '../../../transport/createOfficialMcpClient';
import { createDingtalkClient } from '../createDingtalkClient';
import { DINGTALK_TOOL_POLICY, DINGTALK_SERVICES } from '../dingtalkTools';

jest.mock('../../../transport/createOfficialMcpClient');
const createRemote = jest.mocked(createOfficialMcpClient);
const url = `https://mcp-gw.dingtalk.com${DINGTALK_SERVICES.todo.path}`;
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
  const credential = {
    version: 1 as const,
    clientId: 'managed-client',
    account: { corpId: 'org', userId: 'user' },
    tokens: {
      accessToken: 'private-access',
      refreshToken: 'private-refresh',
      expiresAt: Date.now() + 3600000,
      refreshExpiresAt: Date.now() + 86400000,
    },
  };
  const context: PluginClientContext = {
    pluginId: 'dingtalk',
    tools: DINGTALK_TOOL_POLICY,
    signal,
    getCredential: jest.fn(async () => credential),
    assertAuthorized: jest.fn(async () => {}),
    requestAuthorization: jest.fn(async () => {}),
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
  createRemote.mockImplementation(async (_bound, connection) => {
    if (connection.url !== url) throw new Error('unavailable private endpoint');
    return remote;
  });
  return { context, remote, credential };
}
beforeEach(() => createRemote.mockReset());

it('requires completed account authorization before discovering tools', async () => {
  const { context } = fixture();
  jest.mocked(context.getCredential).mockResolvedValue({});
  await expect(createDingtalkClient(context)).rejects.toMatchObject({ reason: 'authorization' });
  expect(createRemote).not.toHaveBeenCalled();
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
  const [bound, connection] = createRemote.mock.calls.find(([, target]) => target.url === url)!;
  expect(connection.url).toBe(url);
  await expect(
    bound.authorization.apply(
      { ...credential, account: { corpId: 'other-org', userId: 'user' } },
      { url: new URL(url), headers: new Headers() },
    ),
  ).rejects.toMatchObject({ reason: 'authorization' });
  await expect(
    bound.authorization.apply(credential, {
      url: new URL('https://attacker.invalid/server'),
      headers: new Headers(),
    }),
  ).rejects.toMatchObject({ reason: 'request' });
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

it('rejects repeated pagination without exposing tools from that service', async () => {
  const { context, remote } = fixture();
  remote.listTools
    .mockResolvedValueOnce({ tools: [definition(read)], nextCursor: 'same-cursor' })
    .mockResolvedValue({ tools: [], nextCursor: 'same-cursor' });
  const client = await createDingtalkClient(context);
  await expect(client.listTools()).rejects.toMatchObject({ reason: 'access' });
  expect(remote.listTools).toHaveBeenCalledTimes(2);
  await expect(client.callTool({ name: read, args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  expect(remote.callTool).not.toHaveBeenCalled();
  await client.close();
});

it('stops using the session when the authorized account changes', async () => {
  const { context, remote, credential } = fixture();
  const client = await createDingtalkClient(context);
  await client.listTools();
  jest
    .mocked(context.getCredential)
    .mockResolvedValue({ ...credential, account: { corpId: 'other-org', userId: 'user' } });
  await expect(client.callTool({ name: read, args: {} })).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(remote.callTool).not.toHaveBeenCalled();
  await client.close();
});

it('retains authorized cloud services, enforces service ownership and reports partial discovery', async () => {
  const { context, remote } = fixture();
  remote.listTools.mockResolvedValue({
    tools: [definition(read), definition(write, true), definition('send_email')],
  });
  const client = await createDingtalkClient(context);
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([read, write]);
  expect(client.discoveryWarnings?.length).toBe(Object.keys(DINGTALK_SERVICES).length - 1);
  expect(JSON.stringify(client.discoveryWarnings)).not.toContain('private endpoint');
  await expect(client.callTool({ name: 'send_email', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  await client.callTool({ name: read, args: {} });
  await client.close();
});

it('intercepts behavior authorization without exposing the payload or replaying a write', async () => {
  const { context, remote } = fixture();
  const client = await createDingtalkClient(context);
  await client.listTools();
  remote.callTool.mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: false,
          code: 'AGENT_CODE_NOT_EXISTS',
          data: { clientId: 'app', clientSecret: 'private-secret' },
        }),
      },
    ],
  });
  await expect(client.callTool({ name: write, args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  expect(context.requestAuthorization).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'AGENT_CODE_NOT_EXISTS',
      clientId: 'app',
      clientSecret: 'private-secret',
    }),
  );
  expect(remote.callTool).toHaveBeenCalledTimes(1);
  await client.close();
});
