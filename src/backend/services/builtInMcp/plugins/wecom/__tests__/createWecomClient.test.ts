import type { PluginClient, PluginClientContext } from '../../../pluginDefinition';
import { createWecomClient } from '../createWecomClient';
import { getWecomToolEffect } from '../wecomTools';

const mockCall = jest.fn();
jest.mock('../wecomApi', () => ({
  ...jest.requireActual('../wecomApi'),
  createWecomApi: () => ({ call: mockCall }),
}));
jest.mock('../wecomFiles', () => ({
  prepareWecomFiles: async (_api: unknown, _schema: unknown, args: unknown) => ({ payload: args }),
  saveWecomResult: (_schema: unknown, value: unknown) => value,
  saveWecomFile: () => ({ file_path: 'file:///download' }),
}));

const output = (value: unknown) => ({ kind: 'json', value: { result: JSON.stringify(value) } });
const method = (path: string) => ({
  path,
  http_method: 'POST',
  request: { $ref: 'Request' },
  description: 'Official description',
});
const service = (methods: Record<string, unknown>) => ({
  schemas: {
    Request: {
      type: 'object',
      properties: { keywords: { type: 'array', items: { type: 'string' } } },
    },
  },
  methods,
});
let context: PluginClientContext;
let credential = {
  version: 1,
  botId: 'bot-1',
  secret: 'private-secret',
  token: 'private-token',
};
let client: PluginClient | undefined;
beforeEach(() => {
  mockCall.mockReset();
  credential = { ...credential, botId: 'bot-1' };
  context = {
    pluginId: 'wecom',
    tools: {},
    signal: new AbortController().signal,
    getCredential: jest.fn(async () => credential),
    assertAuthorized: jest.fn(async () => {}),
    authorization: { apply: () => {} },
  };
  mockCall.mockImplementation(async ({ endpoint, payload }) => {
    if (endpoint.path !== '/cli/service/discovery')
      return output({ items: [1], next_cursor: 'next' });
    if (!payload.service) return output({ items: [{ name: 'doc' }, { name: 'mail' }] });
    return output(
      payload.service === 'doc'
        ? service({ search: method('/doc/search') })
        : service({ new_action: method('/mail/new_action') }),
    );
  });
});
afterEach(async () => {
  await client?.close();
  client = undefined;
});

it('discovers current official tools and routes exact arguments through the new gateway', async () => {
  client = await createWecomClient(context);
  const { tools } = await client.listTools();
  expect(tools.map(({ name }) => name)).toEqual(['wecom_doc__search', 'wecom_mail__new_action']);
  expect(tools[0].inputSchema.properties).toEqual({
    keywords: { type: 'array', items: { type: 'string' } },
  });
  expect(getWecomToolEffect(tools[0].name)).toBe('read');
  expect(getWecomToolEffect(tools[1].name)).toBe('write');
  const args = { keywords: ['weekly'] };
  const result = await client.callTool({ name: 'wecom_doc__search', args });
  expect(result.content).toEqual([{ type: 'text', text: '{"items":[1],"next_cursor":"next"}' }]);
  expect(mockCall.mock.calls.at(-1)?.[0]).toMatchObject({
    endpoint: { path: '/cli/doc/search' },
    payload: args,
    effect: 'read',
  });
  expect(JSON.stringify(mockCall.mock.calls)).not.toContain('private-');
});

it('retains successful services and safe diagnostics after a partial discovery failure', async () => {
  const implementation = mockCall.getMockImplementation()!;
  mockCall.mockImplementation((request) =>
    request.payload.service === 'mail'
      ? Promise.reject(new Error('private-url'))
      : implementation(request),
  );
  client = await createWecomClient(context);
  expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(['wecom_doc__search']);
  expect(client.discoveryWarnings).toEqual([expect.stringContaining('Wecom mail')]);
  expect(JSON.stringify(client.discoveryWarnings)).not.toContain('private-url');
});

it('caches discovery but rejects undiscovered names, changed identities and calls after close', async () => {
  client = await createWecomClient(context);
  await expect(client.callTool({ name: 'wecom_doc__search', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  await client.listTools();
  await client.listTools();
  expect(mockCall).toHaveBeenCalledTimes(3);
  await expect(client.callTool({ name: 'wecom_doc__invented', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  credential = { ...credential, botId: 'other-bot' };
  await expect(client.callTool({ name: 'wecom_doc__search', args: {} })).rejects.toMatchObject({
    reason: 'authorization',
  });
  await client.close();
  await expect(client.callTool({ name: 'wecom_doc__search', args: {} })).rejects.toMatchObject({
    reason: 'cancelled',
  });
});
