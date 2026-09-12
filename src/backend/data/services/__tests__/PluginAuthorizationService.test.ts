import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { AgentService } from '../AgentService';
import { AgentToolBindingService } from '../AgentToolBindingService';
import { McpServerService } from '../McpServerService';
import { PluginAuthorizationService } from '../PluginAuthorizationService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

let db: TestDb;
let service: PluginAuthorizationService;
const reference = (id: number) => ({
  storage: 'secure-store-v1' as const,
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
});
const input = {
  pluginId: 'github' as const,
  authMethod: 'personal_token',
  serverName: 'GitHub',
  accountLabel: 'cherry',
  credentialReference: reference(1),
};
beforeEach(async () => {
  db = createTestDb(new DatabaseSync(':memory:'));
  await installTestHost({ DbService: db.dbService });
  service = new PluginAuthorizationService();
});
afterEach(async () => {
  await uninstallTestHost();
  db.sqlite.close();
});

it('stores a grant and built-in identity atomically while exposing no credentials', async () => {
  const connection = await service.connect(input);
  expect(connection).toEqual({
    pluginId: 'github',
    accountLabel: 'cherry',
    serverId: expect.any(String),
    connectedAt: expect.any(String),
  });
  expect(await service.listConnections()).toEqual([connection]);
  const server = await new McpServerService().getById(connection.serverId);
  expect(server).toMatchObject({
    origin: 'builtin',
    builtinId: 'github',
    endpointUrl: null,
    authorizationId: expect.any(String),
    isEnabled: true,
  });
  expect(server.headers).toBeUndefined();
  expect(connection).not.toHaveProperty('credential');
  expect(server).not.toHaveProperty('credential');
});

it('persists Feishu credential references without exposing them in connection or MCP data', async () => {
  const credential = reference(1);
  const connection = await service.connect({
    pluginId: 'feishu',
    authMethod: 'feishu_user',
    serverName: 'Feishu',
    accountLabel: 'Cherry (ou_cherry)',
    credentialReference: credential,
  });
  const server = await new McpServerService().getById(connection.serverId);
  expect(server).toMatchObject({
    origin: 'builtin',
    builtinId: 'feishu',
    name: 'Feishu',
    endpointUrl: null,
  });
  expect(
    db.sqlite.prepare('SELECT auth_method, credential FROM plugin_authorization').get(),
  ).toEqual({
    auth_method: 'feishu_user',
    credential: JSON.stringify(credential),
  });
  expect((await service.listConnections())[0]).not.toHaveProperty('credential');
  expect(server).not.toHaveProperty('credential');
});

it('rotates grant identity without retargeting an old credential reference', async () => {
  const first = await service.connect(input);
  const oldServer = await new McpServerService().getById(first.serverId);
  if (oldServer.origin !== 'builtin') throw new Error('Expected a plugin');
  const second = await service.connect({
    ...input,
    credentialReference: reference(2),
  });
  expect(second.serverId).toBe(first.serverId);
  await expect(service.getAuthorizedGrant('github', oldServer.authorizationId)).rejects.toThrow();
  const newServer = await new McpServerService().getById(second.serverId);
  if (newServer.origin !== 'builtin') throw new Error('Expected a plugin');
  expect(
    (await service.getAuthorizedGrant('github', newServer.authorizationId)).credentialReference,
  ).toEqual(reference(2));
  expect(db.sqlite.prepare('SELECT count(*) AS count FROM plugin_authorization').get()).toEqual({
    count: 1,
  });
});

it('retains disabled grants for backend renewal without making them executable', async () => {
  const credential = reference(1);
  const connection = await service.connect({
    ...input,
    pluginId: 'feishu',
    authMethod: 'feishu_user',
    credentialReference: credential,
  });
  const server = await new McpServerService().getById(connection.serverId);
  if (server.origin !== 'builtin') throw new Error('Expected a plugin');
  await new McpServerService().update(connection.serverId, { isEnabled: false });
  expect(await service.getCurrentGrant('feishu', 'feishu_user')).toMatchObject({
    credentialReference: credential,
  });
  await expect(service.getAuthorizedGrant('feishu', server.authorizationId)).rejects.toThrow();
  expect(await service.getCurrentGrant('github', 'personal_token')).toBeUndefined();
  await service.disconnect('feishu');
  expect(await service.getCurrentGrant('feishu', 'feishu_user')).toBeUndefined();
});

it('rolls back both the grant and server when committing a credential change fails', async () => {
  const first = await service.connect(input);
  const oldServer = await new McpServerService().getById(first.serverId);
  db.failWriteTxCommit(new Error('disk full'));
  await expect(service.connect({ ...input, credentialReference: reference(2) })).rejects.toThrow(
    'disk full',
  );
  expect(await new McpServerService().getById(first.serverId)).toEqual(oldServer);
  expect(db.sqlite.prepare('SELECT credential FROM plugin_authorization').all()).toEqual([
    { credential: JSON.stringify(reference(1)) },
  ]);
});

it('disables existing assistant bindings when disconnecting, and does not revive them on reconnect', async () => {
  const connection = await service.connect(input);
  const agent = await new AgentService().create({ name: 'Plugin test', modelId: null });
  const bindings = new AgentToolBindingService();
  await bindings.upsert(agent.id, {
    source: 'mcp',
    serverId: connection.serverId,
    approval: 'ask',
    enabled: true,
  });
  await expect(service.disconnect('github')).resolves.toEqual({ serverId: connection.serverId });
  expect(await service.listConnections()).toEqual([]);
  expect((await bindings.list(agent.id)).items).toEqual([
    expect.objectContaining({ enabled: false, serverId: connection.serverId }),
  ]);
  const next = await service.connect(input);
  expect(next.serverId).not.toBe(connection.serverId);
});

it('rejects remote retargeting and generic deletion of a plugin server', async () => {
  const connection = await service.connect(input);
  const servers = new McpServerService();
  await expect(
    servers.update(connection.serverId, { endpointUrl: 'https://other.example/mcp' }),
  ).rejects.toBeDefined();
  await expect(
    servers.update(connection.serverId, { headers: { Authorization: 'secret' } }),
  ).rejects.toBeDefined();
  await expect(servers.delete(connection.serverId)).rejects.toBeDefined();
  await expect(
    servers.update(connection.serverId, { disabledTools: ['create_issue'] }),
  ).resolves.toMatchObject({ disabledTools: ['create_issue'] });
});

it('enforces remote/built-in storage constraints and referenced grant deletion', async () => {
  const connection = await service.connect(input);
  const update = db.sqlite.prepare('UPDATE mcp_server SET base_url = ? WHERE id = ?');
  expect(() => update.run('https://remote.example/mcp', connection.serverId)).toThrow();
  expect(() => db.sqlite.exec('DELETE FROM plugin_authorization')).toThrow();
  expect(() => db.sqlite.exec("UPDATE plugin_authorization SET auth_method = ''")).toThrow();
  expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('retains and disconnects an unregistered plugin without a provider-specific data branch', async () => {
  const connection = await service.connect({
    pluginId: 'vendor.future-plugin',
    authMethod: 'future_method_v2',
    serverName: 'Future plugin',
    accountLabel: 'Future account',
    credentialReference: reference(1),
  });
  const server = await new McpServerService().getById(connection.serverId);
  expect(server).toMatchObject({ builtinId: 'vendor.future-plugin', name: 'Future plugin' });
  expect(await service.listConnections()).toEqual([connection]);
  await service.disconnect('vendor.future-plugin');
  expect(await service.listConnections()).toEqual([]);
  expect(db.sqlite.prepare('SELECT * FROM plugin_authorization').all()).toEqual([]);
});

it('rejects plaintext, malformed references and non-JSON credentials before writing a connection', async () => {
  for (const credential of [
    { version: 1, token: 'plain-token' },
    { storage: 'secure-store-v1', id: 'invalid' },
    { ...reference(1), token: 'plain-token' },
    'plain-token',
    ['token'],
    { token: undefined },
    { token: () => 'secret' },
  ]) {
    await expect(
      service.connect({ ...input, credentialReference: credential as never }),
    ).rejects.toThrow();
  }
  expect(await service.listConnections()).toEqual([]);
});
