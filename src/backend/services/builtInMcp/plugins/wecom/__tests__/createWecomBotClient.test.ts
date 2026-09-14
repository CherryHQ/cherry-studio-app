import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClientContext } from '../../../pluginDefinition';
import { createWecomBotClient } from '../createWecomBotClient';
import { wecomBotApi, WecomBotApiError } from '../wecomBotApi';
import { WECOM_TOOL_POLICY } from '../wecomTools';

jest.mock('../wecomBotApi', () => ({
  ...jest.requireActual('../wecomBotApi'),
  wecomBotApi: { invoke: jest.fn() },
}));

const credential = { version: 2, botId: 'bot-1', secret: 'secret', token: 'old-token' };
const definition = {
  schemas: { Request: { type: 'object', properties: { title: { type: 'string' } } } },
  methods: { create: { path: '/todo/create', http_method: 'POST', request: { $ref: 'Request' } } },
};
beforeEach(() => jest.resetAllMocks());

async function fixture() {
  let current = credential;
  const context: PluginClientContext = {
    pluginId: 'wecom',
    tools: WECOM_TOOL_POLICY,
    signal: new AbortController().signal,
    getCredential: async () => current,
    assertAuthorized: jest.fn(async () => {}),
    authorization: { apply() {} },
    rejectCredential: jest.fn(async () => {
      current = { ...credential, token: 'new-token' };
    }),
  };
  jest
    .mocked(wecomBotApi.invoke)
    .mockResolvedValueOnce({ items: [{ name: 'todo' }] })
    .mockResolvedValueOnce(definition);
  const client = await createWecomBotClient(context, credential.botId);
  await client.listTools();
  jest.mocked(wecomBotApi.invoke).mockReset();
  return { client, context };
}

it('refreshes and replays only a request explicitly rejected for an expired token', async () => {
  const { client, context } = await fixture();
  try {
    jest
      .mocked(wecomBotApi.invoke)
      .mockRejectedValueOnce(new WecomBotApiError(853004))
      .mockResolvedValueOnce({ items: [{ success: true }] });
    await client.callTool({ name: 'bot_todo_create', args: { title: 'Task' } });
    expect(context.rejectCredential).toHaveBeenCalledTimes(1);
    expect(jest.mocked(wecomBotApi.invoke).mock.calls.map((call) => call[2])).toEqual([
      'old-token',
      'new-token',
    ]);
  } finally {
    await client.close();
  }
});

it('does not replay an uncertain write or refresh its token', async () => {
  const { client, context } = await fixture();
  try {
    jest.mocked(wecomBotApi.invoke).mockRejectedValue(new PluginError('network', 'Timed out'));
    await expect(
      client.callTool({ name: 'bot_todo_create', args: { title: 'Task' } }),
    ).rejects.toMatchObject({ reason: 'unknown-write' });
    expect(wecomBotApi.invoke).toHaveBeenCalledTimes(1);
    expect(context.rejectCredential).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it('blocks undiscovered tools and sends nothing after close', async () => {
  const { client } = await fixture();
  await expect(client.callTool({ name: 'bot_todo_delete', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  await client.close();
  await expect(client.callTool({ name: 'bot_todo_create', args: {} })).rejects.toBeDefined();
  expect(wecomBotApi.invoke).not.toHaveBeenCalled();
});
