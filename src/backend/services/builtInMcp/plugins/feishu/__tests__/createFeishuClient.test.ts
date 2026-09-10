import { HttpError } from '@/backend/services/http';

import type { PluginClient, PluginClientContext } from '../../../pluginDefinition';
import { createOfficialMcpClient } from '../../../transport/createOfficialMcpClient';
import { createFeishuClient } from '../createFeishuClient';
import { FEISHU_REQUIRED_SCOPES, FEISHU_TOOL_POLICY } from '../feishuTools';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: (options: { baseUrl: string }) => ({
    request: (input: unknown) => mockRequest(options.baseUrl, input),
  }),
}));
jest.mock('../../../transport/createOfficialMcpClient', () => ({
  createOfficialMcpClient: jest.fn(),
}));

const credential = {
  version: 1,
  application: { appId: 'cli_cherry', appSecret: 'private-secret' },
  tokens: {
    accessToken: 'private-access',
    refreshToken: 'private-refresh',
    expiresAt: 3600000,
    refreshExpiresAt: 86400000,
    scope: FEISHU_REQUIRED_SCOPES.join(' '),
  },
};
const remoteTool = {
  name: 'search-doc',
  inputSchema: { type: 'object' as const, properties: { query: { type: 'string' } } },
};
const mockRemote = {
  serverInfo: { name: 'feishu-fixture', version: '1' },
  listTools: jest.fn(),
  callTool: jest.fn(),
  close: jest.fn(),
};
let context: PluginClientContext;
let client: PluginClient;

beforeEach(async () => {
  jest.clearAllMocks();
  context = {
    pluginId: 'feishu',
    tools: FEISHU_TOOL_POLICY,
    signal: new AbortController().signal,
    getCredential: jest.fn(async () => credential),
    assertAuthorized: jest.fn(async () => {}),
    rejectCredential: jest.fn(async () => {}),
    authorization: { apply: jest.fn() },
  };
  mockRemote.close.mockResolvedValue(undefined);
  mockRemote.listTools.mockResolvedValue({ tools: [remoteTool] });
  mockRemote.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'document result' }] });
  jest.mocked(createOfficialMcpClient).mockResolvedValue(mockRemote);
  mockRequest.mockReset().mockResolvedValue({
    data: {
      code: 0,
      data: { items: [{ record_id: 'recOne' }], has_more: true, page_token: 'next-page' },
    },
  });
  client = await createFeishuClient(context);
});
afterEach(async () => {
  await client.close();
});

it('combines only admitted remote tools and local operations while preserving remote pagination and schemas', async () => {
  mockRemote.listTools.mockResolvedValueOnce({
    tools: [remoteTool, { name: 'fetch-file' }, { name: 'base_list_tables' }],
    nextCursor: 'remote-next',
  });
  const first = await client.listTools();
  expect(first.nextCursor).toBe('remote-next');
  expect(first.tools.find((tool) => tool.name === 'search-doc')).toEqual(remoteTool);
  expect(first.tools.filter((tool) => tool.name === 'base_list_tables')).toHaveLength(1);
  expect(first.tools.some((tool) => tool.name === 'fetch-file')).toBe(false);
  const next = await client.listTools({ params: { cursor: 'remote-next' } });
  expect(next.tools).toEqual([remoteTool]);
  expect(mockRemote.listTools.mock.calls[1][0].params).toEqual({ cursor: 'remote-next' });
  expect(createOfficialMcpClient).toHaveBeenCalledWith(
    expect.objectContaining({ tools: expect.not.objectContaining({ base_list_tables: 'read' }) }),
    { url: 'https://mcp.feishu.cn/mcp' },
  );
});

it('routes documents remotely and Base directly, preserving provider pagination and sending only the user token', async () => {
  await client.callTool({ name: 'search-doc', args: { query: 'requirements' } });
  expect(mockRemote.callTool).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'search-doc', args: { query: 'requirements' } }),
  );
  expect(mockRequest).not.toHaveBeenCalled();
  const result = await client.callTool({
    name: 'base_list_tables',
    args: { app_token: 'bascnOne' },
  });
  expect(result).toEqual({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          items: [{ record_id: 'recOne' }],
          has_more: true,
          page_token: 'next-page',
        }),
      },
    ],
  });
  expect(mockRequest).toHaveBeenCalledWith(
    'https://open.feishu.cn',
    expect.objectContaining({
      method: 'GET',
      path: '/open-apis/bitable/v1/apps/bascnOne/tables',
      headers: { Authorization: 'Bearer private-access' },
      redirect: 'error',
      maxResponseBytes: 122880,
    }),
  );
  expect(JSON.stringify(mockRequest.mock.calls)).not.toMatch(
    /private-secret|private-refresh|X-Lark-MCP/,
  );
  const decoder = mockRequest.mock.calls[0][1].errorDecoder;
  expect(
    decoder({ data: { code: 99991677, msg: 'private-access', error: 'private-secret' } }),
  ).toEqual({
    code: '99991677',
    message: 'Feishu request failed.',
  });
  expect(decoder({ data: { msg: 'private-access' } })).toBeUndefined();
  expect(mockRemote.callTool).toHaveBeenCalledTimes(1);
});

it('bounds the UTF-8 request size before resolving credentials or submitting a write', async () => {
  const fields = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [`field${index}`, '中'.repeat(20_000)]),
  );
  await expect(
    client.callTool({
      name: 'base_create_record',
      args: { app_token: 'bascnOne', table_id: 'tblOne', fields },
    }),
  ).rejects.toMatchObject({ reason: 'request' });
  expect(context.getCredential).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
});

it('rejects unknown operations and arbitrary routes before credentials or HTTP dispatch', async () => {
  await expect(client.callTool({ name: 'fetch-file', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  await expect(
    client.callTool({
      name: 'base_list_tables',
      args: { app_token: 'bascnOne', url: 'https://evil.test' },
    }),
  ).rejects.toMatchObject({ reason: 'request' });
  expect(context.getCredential).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockRemote.callTool).not.toHaveBeenCalled();
});

it('rechecks a revoked grant after resolving refreshed credentials', async () => {
  jest.mocked(context.getCredential).mockImplementation(async () => {
    jest.mocked(context.assertAuthorized).mockRejectedValue(new Error('revoked'));
    return credential;
  });
  await expect(
    client.callTool({ name: 'base_list_tables', args: { app_token: 'bascnOne' } }),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(mockRequest).not.toHaveBeenCalled();
});

it('requires the operation scope and does not silently accept the former document-only grant', async () => {
  jest.mocked(context.getCredential).mockResolvedValue({
    ...credential,
    tokens: { ...credential.tokens, scope: 'docx:document:readonly' },
  });
  await expect(
    client.callTool({ name: 'base_list_tables', args: { app_token: 'bascnOne' } }),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(mockRequest).not.toHaveBeenCalled();
});

it('does not submit a write cancelled while credentials are resolving', async () => {
  const abort = new AbortController();
  jest.mocked(context.getCredential).mockImplementation(async () => {
    abort.abort();
    return credential;
  });
  await expect(
    client.callTool({
      name: 'base_create_record',
      args: { app_token: 'bascnOne', table_id: 'tblOne', fields: { title: 'New record' } },
      options: { abortSignal: abort.signal },
    }),
  ).rejects.toMatchObject({ reason: 'cancelled' });
  expect(mockRequest).not.toHaveBeenCalled();
});

it('closes in-flight local calls and refuses later calls without replaying an uncertain write', async () => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mockRequest.mockImplementation(
    (_url, input) =>
      new Promise((_resolve, reject) => {
        input.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        });
        entered();
      }),
  );
  const pending = client.callTool({
    name: 'base_create_record',
    args: { app_token: 'bascnOne', table_id: 'tblOne', fields: { title: 'New record' } },
  });
  const rejected = expect(pending).rejects.toMatchObject({ reason: 'unknown-write' });
  await started;
  await client.close();
  await rejected;
  await expect(
    client.callTool({ name: 'base_list_tables', args: { app_token: 'bascnOne' } }),
  ).rejects.toMatchObject({ reason: 'cancelled' });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(mockRemote.close).toHaveBeenCalledTimes(1);
});

it('keeps later calls independent of the initialization deadline', async () => {
  await client.close();
  const initialization = new AbortController();
  client = await createFeishuClient({ ...context, signal: initialization.signal });
  initialization.abort();
  await client.callTool({ name: 'calendar_get_primary', args: {} });
  expect(mockRequest.mock.calls[0][1].signal.aborted).toBe(false);
});

it.each([
  [99991677, 'authorization'],
  [99991672, 'access'],
  [1254290, 'quota'],
  [1254060, 'request'],
  [1255001, 'unknown-write'],
])(
  'sanitizes Feishu code %s in HTTP-200 failures and never replays a write',
  async (code, reason) => {
    mockRequest.mockResolvedValue({
      data: { code, msg: 'private-secret', error: { private: 'private-refresh' } },
    });
    const error = await client
      .callTool({
        name: 'base_create_record',
        args: { app_token: 'bascnOne', table_id: 'tblOne', fields: { title: 'New record' } },
      })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ reason });
    expect(String(error)).not.toMatch(/private-secret|private-refresh/);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    if (reason === 'authorization')
      expect(context.rejectCredential).toHaveBeenCalledWith(credential);
    else expect(context.rejectCredential).not.toHaveBeenCalled();
  },
);

it.each([
  [401, 'authorization'],
  [403, 'access'],
  [429, 'quota'],
  [500, 'unknown-write'],
  [408, 'unknown-write'],
  [undefined, 'unknown-write'],
])(
  'sanitizes HTTP status %s and transport failures without write replay',
  async (status, reason) => {
    mockRequest.mockRejectedValue(
      new HttpError('private-secret', { kind: status ? 'http' : 'network', status }),
    );
    const error = await client
      .callTool({
        name: 'base_create_record',
        args: { app_token: 'bascnOne', table_id: 'tblOne', fields: { title: 'New record' } },
      })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ reason });
    expect(String(error)).not.toContain('private-secret');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);

it('treats a read-only POST failure as a read and an unreadable write result as uncertain', async () => {
  mockRequest.mockRejectedValueOnce(new HttpError('safe', { kind: 'network' }));
  await expect(client.callTool({ name: 'calendar_get_primary', args: {} })).rejects.toMatchObject({
    reason: 'network',
  });
  mockRequest.mockResolvedValueOnce({ data: '<html>not JSON</html>' });
  await expect(
    client.callTool({
      name: 'base_create_record',
      args: { app_token: 'bascnOne', table_id: 'tblOne', fields: { title: 'New record' } },
    }),
  ).rejects.toMatchObject({ reason: 'unknown-write' });
  expect(mockRequest).toHaveBeenCalledTimes(2);
});
