import type { ListToolsResult } from '@ai-sdk/mcp';

import { PluginError } from '@/shared/contracts/plugins';

import {
  getPluginToolEffect,
  type PluginClient,
  type PluginClientContext,
} from '../../../pluginDefinition';
import { createOfficialMcpClient } from '../../../transport/createOfficialMcpClient';
import { createWecomClient } from '../createWecomClient';
import type { WecomBotCredential, WecomCredential } from '../wecomCredentials';
import { wecomPlugin } from '../wecomPlugin';

jest.mock('../../../transport/createOfficialMcpClient', () => ({
  createOfficialMcpClient: jest.fn(),
}));
const makeCredential = (): WecomBotCredential => ({
  version: 3,
  kind: 'bot',
  botId: 'bot-1',
  secret: 'private-secret',
  configId: 'config-1',
  connections: ['doc', 'mail'].map((category) => ({
    category,
    url: `https://qyapi.weixin.qq.com/mcp/bot/${category}?key=private-${category}`,
  })),
});
function remote(tools: ListToolsResult['tools']) {
  return {
    serverInfo: { name: 'Official WeCom', version: '1' },
    listTools: jest.fn(async (): Promise<ListToolsResult> => ({ tools })),
    callTool: jest.fn(async () => ({
      content: [{ type: 'text' as const, text: '{"errcode":0}' }],
    })),
    close: jest.fn(async () => {}),
  };
}
const definition = (name: string): ListToolsResult['tools'][number] => ({
  name,
  description: 'Official description',
  inputSchema: { type: 'object', properties: {} },
});
let credential: WecomCredential;
let context: PluginClientContext;
let doc: ReturnType<typeof remote>;
let mail: ReturnType<typeof remote>;
let client: PluginClient | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  credential = makeCredential();
  context = {
    pluginId: 'wecom',
    tools: wecomPlugin.tools,
    signal: new AbortController().signal,
    getCredential: jest.fn(async () => credential),
    assertAuthorized: jest.fn(async () => {}),
    rejectCredential: jest.fn(async () => {}),
    authorization: wecomPlugin.authMethods[0].createRequestAuthorization(wecomPlugin.tools),
  };
  doc = remote([definition('get_doc_content'), definition('create_doc')]);
  mail = remote([definition('send_mail')]);
  jest
    .mocked(createOfficialMcpClient)
    .mockImplementation(async (_context, connection) =>
      connection.url.endsWith('/doc') ? doc : mail,
    );
});
afterEach(async () => {
  await client?.close();
  client = undefined;
});

it('exposes official schemas and new tools while reserving read access for reviewed service/name pairs', async () => {
  const schema = { type: 'object' as const, properties: { mode: { enum: ['new-mode'] } } };
  mail.listTools.mockResolvedValue({
    tools: [
      { ...definition('new_operation'), inputSchema: schema, annotations: { readOnlyHint: true } },
      definition('get_doc_content'),
    ],
  });
  client = await createWecomClient(context);
  const page = await client.listTools();
  const tool = page.tools.find(({ name }) => name === 'wecom_mail__new_operation')!;
  expect(tool.inputSchema).toBe(schema);
  expect(tool.description).toBe('Official description');
  expect(tool.annotations?.readOnlyHint).toBe(false);
  expect(getPluginToolEffect(wecomPlugin, tool.name)).toBe('write');
  expect(getPluginToolEffect(wecomPlugin, 'wecom_mail__get_doc_content')).toBe('write');
  expect(getPluginToolEffect(wecomPlugin, 'wecom_doc__get_doc_content')).toBe('read');
  const args = { mode: 'new-mode', file_url: 'https://example.test/report.pdf' };
  const output = { content: [{ type: 'text' as const, text: '{"official":"result"}' }] };
  mail.callTool.mockResolvedValue(output);
  expect(await client.callTool({ name: tool.name, args })).toBe(output);
  expect(mail.callTool.mock.calls[0]).toEqual([
    expect.objectContaining({ name: 'new_operation', args }),
  ]);
});

it('rejects undiscovered names and keeps credentials out of SDK endpoints', async () => {
  client = await createWecomClient(context);
  await expect(client.callTool({ name: 'wecom_doc__create_doc', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  await client.listTools();
  const [transport, connection] = jest.mocked(createOfficialMcpClient).mock.calls[0];
  expect(connection.url).toBe('https://qyapi.weixin.qq.com/mcp/bot/doc');
  const url = new URL(connection.url);
  await transport.authorization.apply(credential, { url, headers: new Headers() });
  expect(url.href).toBe(credential.connections[0].url);
  await expect(client.callTool({ name: 'wecom_doc__invented', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  expect(doc.callTool).not.toHaveBeenCalled();
});

it('retains other services after partial discovery failures and handles tool pagination', async () => {
  mail.listTools.mockRejectedValue(new Error('private-upstream-url'));
  doc.listTools.mockResolvedValueOnce({
    tools: [definition('get_doc_content')],
    nextCursor: 'page2',
  });
  doc.listTools.mockResolvedValueOnce({ tools: [definition('create_doc')] });
  client = await createWecomClient(context);
  expect((await client.listTools()).tools.map(({ name }) => name)).toEqual([
    'wecom_doc__get_doc_content',
    'wecom_doc__create_doc',
  ]);
  expect(client.discoveryWarnings).toEqual([expect.stringContaining('Wecom mail')]);
  expect(JSON.stringify(client.discoveryWarnings)).not.toContain('private-upstream');
});

it('replaces sessions after MCP credential rotation and rejects an old session using a new grant', async () => {
  client = await createWecomClient(context);
  await client.listTools();
  const oldTransport = jest.mocked(createOfficialMcpClient).mock.calls[0][0];
  credential = { ...makeCredential(), configId: 'config-2' };
  await expect(
    oldTransport.authorization.apply(credential, {
      url: new URL('https://qyapi.weixin.qq.com/mcp/bot/doc'),
      headers: new Headers(),
    }),
  ).rejects.toMatchObject({ reason: 'access' });
  await client.callTool({ name: 'wecom_doc__get_doc_content', args: {} });
  expect(doc.close).toHaveBeenCalledTimes(1);
  expect(createOfficialMcpClient).toHaveBeenCalledTimes(3);
});

it('never replays uncertain writes or authorization failures', async () => {
  client = await createWecomClient(context);
  await client.listTools();
  doc.callTool.mockRejectedValueOnce(new Error('private-network-detail'));
  await expect(client.callTool({ name: 'wecom_doc__create_doc', args: {} })).rejects.toMatchObject({
    reason: 'unknown-write',
    message: expect.not.stringContaining('private-'),
  });
  doc.callTool.mockRejectedValueOnce(new PluginError('authorization', 'Refresh authorization.'));
  await expect(client.callTool({ name: 'wecom_doc__create_doc', args: {} })).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(doc.callTool).toHaveBeenCalledTimes(2);
});

it('treats cancellation during an attempted write as an uncertain outcome', async () => {
  client = await createWecomClient(context);
  await client.listTools();
  doc.callTool.mockRejectedValueOnce(new PluginError('cancelled', 'Request cancelled.'));
  await expect(client.callTool({ name: 'wecom_doc__create_doc', args: {} })).rejects.toMatchObject({
    reason: 'unknown-write',
  });
  expect(doc.callTool).toHaveBeenCalledTimes(1);
});

it.each([-32001, -32002, -32003])(
  'invalidates rejected MCP configurations for error %s without exposing the response',
  async (code) => {
    client = await createWecomClient(context);
    await client.listTools();
    const connection = jest.mocked(createOfficialMcpClient).mock.calls[0][1];
    const response = new Response(
      JSON.stringify({ error: { code, message: 'private-upstream' } }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
    await expect(connection.inspectResponse!(response)).rejects.toMatchObject({
      reason: 'authorization',
      message: expect.not.stringContaining('private-upstream'),
    });
    expect(context.rejectCredential).toHaveBeenCalledWith(credential);
    expect(doc.callTool).not.toHaveBeenCalled();
  },
);

it('closes official sessions and prevents calls after disconnect', async () => {
  client = await createWecomClient(context);
  await client.listTools();
  await client.close();
  await expect(client.callTool({ name: 'wecom_doc__create_doc', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  expect(doc.close).toHaveBeenCalledTimes(1);
  expect(mail.close).toHaveBeenCalledTimes(1);
});
