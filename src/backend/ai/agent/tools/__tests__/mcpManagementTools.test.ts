import { createMcpServerMutations } from '@/backend/data/api/handlers/mcpServers';
import { subscribeDataApiChanges } from '@/backend/data/dataApiChanges';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { McpServer, RemoteMcpServer } from '@/shared/data/types/mcpServer';

import type { RuntimeToolCall } from '../../runtime';
import { createMcpManagementTools } from '../mcpManagementTools';

const id = '00000000-0000-4000-8000-000000000001';
const server: RemoteMcpServer = {
  id,
  name: 'Example',
  endpointUrl: 'https://user:password@example.com/private-token?key=secret',
  headers: { Authorization: 'Bearer secret' },
  oauth: { authorizationId: id, clientId: 'private-client' },
  isEnabled: false,
  disabledTools: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const call: RuntimeToolCall = {
  input: {},
  signal: new AbortController().signal,
  toolCallId: 'call',
  turnId: 'turn',
};

function fixture(current: McpServer = server) {
  const servers = {
    list: jest.fn(async () => ({
      items: [current, { ...current, id: 'second' }],
      total: 2,
      page: 1,
    })),
    getById: jest.fn(async () => current),
    create: jest.fn(async () => current),
    delete: jest.fn(),
    update: jest.fn(async () => ({ ...server, endpointUrl: 'https://other.example/mcp' })),
  };
  const runtime = {
    invalidateServer: jest.fn(),
    forgetOAuthAuthorization: jest.fn(async () => undefined),
  };
  const mutations = createMcpServerMutations({ servers, runtime });
  const tools = createMcpManagementTools({ servers, mutations });
  const run = (name: string, input: RuntimeToolCall['input']) =>
    tools.find((tool) => tool.providerName === name)!.execute({ ...call, input });
  return { servers, runtime, tools, run };
}

it('returns bounded metadata without credentials, full endpoints or OAuth references', async () => {
  const { run } = fixture();
  const first = await run('mcp_list_servers', { limit: 1 });
  expect(first.value).toMatchObject({
    total: 2,
    nextPage: 2,
    servers: [{ endpointOrigin: 'https://example.com', headerNames: ['Authorization'] }],
  });
  expect((await run('mcp_list_servers', { limit: 1, page: 2 })).value).toMatchObject({
    nextPage: null,
  });
  const read = await run('mcp_get_server', { server_id: id });
  for (const privateValue of [
    'password',
    'secret',
    'private-token',
    'private-client',
    'authorizationId',
  ])
    expect(JSON.stringify([first, read])).not.toContain(privateValue);
});

it('persists creation through existing mutations and notifies the app without claiming a verified connection', async () => {
  const { run, servers } = fixture();
  const changed = jest.fn();
  const unsubscribe = subscribeDataApiChanges(changed);
  try {
    const input = {
      name: 'Example',
      endpointUrl: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer supplied' },
    };
    expect((await run('mcp_create_server', input)).value).toMatchObject({
      status: 'created',
      connectionVerified: false,
    });
    expect(servers.create).toHaveBeenCalledWith(input);
    expect(changed).toHaveBeenCalledWith(['/mcp-servers', `/mcp-servers/${id}`]);
  } finally {
    unsubscribe();
  }
});

it('passes the read version into persistence and releases the old connection after an endpoint edit', async () => {
  const { run, servers, runtime } = fixture();
  const changes = { endpointUrl: 'https://other.example/mcp' };
  expect(
    (
      await run('mcp_update_server', {
        server_id: id,
        expected_updated_at: server.updatedAt,
        changes,
      })
    ).value,
  ).toMatchObject({ status: 'updated', connectionVerified: false });
  expect(servers.update).toHaveBeenCalledWith(id, changes, { expectedUpdatedAt: server.updatedAt });
  expect(runtime.invalidateServer).toHaveBeenCalledWith(id);
});

it('does not mutate bundled plugin connections or accept executable MCP configurations', async () => {
  const f = fixture({
    id,
    name: 'Plugin',
    origin: 'builtin',
    endpointUrl: null,
    builtinId: 'github',
    authorizationId: id,
    isEnabled: true,
    disabledTools: [],
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  });
  expect(
    (
      await f.run('mcp_update_server', {
        server_id: id,
        expected_updated_at: server.updatedAt,
        changes: { isEnabled: false },
      })
    ).value,
  ).toMatchObject({ code: 'mcp_builtin_connection' });
  expect(
    (
      await f.run('mcp_create_server', {
        name: 'Bad',
        endpointUrl: 'file:///local',
        command: 'npx anything',
      })
    ).value,
  ).toMatchObject({ code: 'mcp_invalid_input' });
  expect(f.servers.update).not.toHaveBeenCalled();
  expect(f.servers.create).not.toHaveBeenCalled();
});

it('reports conflicts and uncertain outcomes without echoing secret-bearing errors or replaying writes', async () => {
  const f = fixture();
  f.servers.update.mockRejectedValue(DataApiErrorFactory.conflict('secret'));
  const result = await f.run('mcp_update_server', {
    server_id: id,
    expected_updated_at: server.updatedAt,
    changes: { name: 'Next' },
  });
  expect(result.value).toMatchObject({ status: 'error', code: 'CONFLICT' });
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(f.servers.update).toHaveBeenCalledTimes(1);
});
