import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClientContext } from '../../../pluginDefinition';
import { createWecomClient } from '../createWecomClient';
import { wecomBotApi, WecomBotApiError } from '../wecomBotApi';
import { WECOM_TOOL_POLICY } from '../wecomTools';
import docService from './fixtures/doc-service.json';

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

function createContext() {
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
  return context;
}

async function fixture() {
  const context = createContext();
  jest
    .mocked(wecomBotApi.invoke)
    .mockResolvedValueOnce({ items: [{ name: 'todo' }] })
    .mockResolvedValueOnce(definition);
  const client = await createWecomClient(context);
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
    await client.callTool({ name: 'wecom_todo_create', args: { title: 'Task' } });
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
      client.callTool({ name: 'wecom_todo_create', args: { title: 'Task' } }),
    ).rejects.toMatchObject({ reason: 'unknown-write' });
    expect(wecomBotApi.invoke).toHaveBeenCalledTimes(1);
    expect(context.rejectCredential).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it('blocks undiscovered tools and sends nothing after close', async () => {
  const { client } = await fixture();
  await expect(client.callTool({ name: 'wecom_todo_delete', args: {} })).rejects.toMatchObject({
    reason: 'access',
  });
  await client.close();
  await expect(client.callTool({ name: 'wecom_todo_create', args: {} })).rejects.toBeDefined();
  expect(wecomBotApi.invoke).not.toHaveBeenCalled();
});

it('creates, reads and edits documents through the same official authorization', async () => {
  const context = createContext();
  jest
    .mocked(wecomBotApi.invoke)
    .mockResolvedValueOnce({ items: [{ name: 'doc' }] })
    .mockResolvedValueOnce(docService);
  const client = await createWecomClient(context);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'wecom_doc_create',
      'wecom_doc_contents_get',
      'wecom_doc_contents_append',
      'wecom_doc_contents_overwrite',
    ]);
    jest.mocked(wecomBotApi.invoke).mockReset();
    jest
      .mocked(wecomBotApi.invoke)
      .mockResolvedValueOnce({ docid: 'doc-1' })
      .mockResolvedValueOnce({ file_path: 'Existing text' })
      .mockResolvedValueOnce({ errcode: 0 });
    await client.callTool({
      name: 'wecom_doc_create',
      args: { doc_name: 'Notes', content: 'Initial text' },
    });
    const read = await client.callTool({
      name: 'wecom_doc_contents_get',
      args: { docid: 'doc-1' },
    });
    expect(read.content).toEqual([
      { type: 'text', text: JSON.stringify({ inline_content: 'Existing text' }) },
    ]);
    await client.callTool({
      name: 'wecom_doc_contents_overwrite',
      args: { docid: 'doc-1', content: 'Updated text' },
    });
    expect(
      jest
        .mocked(wecomBotApi.invoke)
        .mock.calls.map(([path, args, token]) => ({ path, args, token })),
    ).toEqual([
      {
        path: '/cli/doc/create',
        args: { doc_name: 'Notes', content: 'Initial text' },
        token: 'old-token',
      },
      { path: '/cli/doc/contents/get', args: { docid: 'doc-1' }, token: 'old-token' },
      {
        path: '/cli/doc/contents/overwrite',
        args: { docid: 'doc-1', content: 'Updated text' },
        token: 'old-token',
      },
    ]);
    await expect(
      client.callTool({
        name: 'wecom_doc_contents_overwrite',
        args: { docid: 'doc-1', file_path: '/private/notes.md' },
      }),
    ).rejects.toMatchObject({ reason: 'request' });
    expect(wecomBotApi.invoke).toHaveBeenCalledTimes(3);
  } finally {
    await client.close();
  }
});

it('retains working services and reports partial discovery failures', async () => {
  jest.mocked(wecomBotApi.invoke).mockImplementation(async (_path, args) => {
    if (!args.service) return { items: [{ name: 'doc' }, { name: 'todo' }] };
    if (args.service === 'doc') throw new PluginError('network', 'Internal upstream detail');
    return definition;
  });
  const client = await createWecomClient(createContext());
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['wecom_todo_create']);
    expect(client.discoveryWarnings).toEqual([
      'Wecom doc tools are unavailable. Check permissions and refresh the tool list.',
    ]);
  } finally {
    await client.close();
  }
});

it('discovers the hidden identity service for credential validation', async () => {
  jest
    .mocked(wecomBotApi.invoke)
    .mockResolvedValueOnce({ items: [{ name: 'identity', hidden: true }] })
    .mockResolvedValueOnce({
      schemas: { Request: { type: 'object', properties: {} } },
      methods: {
        whoami: {
          path: '/identity/whoami',
          http_method: 'POST',
          hidden: true,
          request: { $ref: 'Request' },
        },
      },
    });
  const client = await createWecomClient(createContext());
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['wecom_identity_whoami']);
  } finally {
    await client.close();
  }
});

it('does not publish late tool routes after closing during discovery', async () => {
  let release!: (value: unknown) => void;
  let started!: () => void;
  const pending = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const discovering = new Promise<void>((resolve) => {
    started = resolve;
  });
  jest
    .mocked(wecomBotApi.invoke)
    .mockResolvedValueOnce({ items: [{ name: 'todo' }] })
    .mockImplementationOnce(async () => {
      started();
      return pending;
    });
  const client = await createWecomClient(createContext());
  const listing = client.listTools();
  const rejected = expect(listing).rejects.toBeDefined();
  await discovering;
  const closing = client.close();
  release(definition);
  await closing;
  await rejected;
  jest.mocked(wecomBotApi.invoke).mockReset();
  await expect(
    client.callTool({ name: 'wecom_todo_create', args: { title: 'Late task' } }),
  ).rejects.toMatchObject({ reason: 'access' });
  expect(wecomBotApi.invoke).not.toHaveBeenCalled();
});
