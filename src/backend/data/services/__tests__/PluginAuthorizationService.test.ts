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
const input = {
  pluginId: 'github' as const,
  accountLabel: 'cherry',
  credentialCiphertext: 'sealed',
  credentialKeyId: 'plugin.key-1',
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
  const { connection } = await service.connect(input);
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
  expect(JSON.stringify(connection)).not.toContain('sealed');
});

it('rotates grant identity without retargeting an old credential reference', async () => {
  const first = await service.connect(input);
  const oldServer = await new McpServerService().getById(first.connection.serverId);
  if (oldServer.origin !== 'builtin') throw new Error('Expected a plugin');
  const second = await service.connect({
    ...input,
    credentialKeyId: 'plugin.key-2',
    credentialCiphertext: 'new-sealed',
  });
  expect(second.connection.serverId).toBe(first.connection.serverId);
  expect(second.oldKeyId).toBe('plugin.key-1');
  await expect(service.getCredentialGrant('github', oldServer.authorizationId)).rejects.toThrow();
  expect(db.sqlite.prepare('SELECT count(*) AS count FROM plugin_authorization').get()).toEqual({
    count: 1,
  });
});

it('rolls back both the grant and server when committing a credential change fails', async () => {
  const first = await service.connect(input);
  const oldServer = await new McpServerService().getById(first.connection.serverId);
  db.failWriteTxCommit(new Error('disk full'));
  await expect(service.connect({ ...input, credentialKeyId: 'plugin.key-2' })).rejects.toThrow(
    'disk full',
  );
  expect(await new McpServerService().getById(first.connection.serverId)).toEqual(oldServer);
  expect(db.sqlite.prepare('SELECT credential_key_id FROM plugin_authorization').all()).toEqual([
    { credential_key_id: 'plugin.key-1' },
  ]);
});

it('disables existing assistant bindings when disconnecting, and does not revive them on reconnect', async () => {
  const { connection } = await service.connect(input);
  const agent = await new AgentService().create({ name: 'Plugin test', modelId: null });
  const bindings = new AgentToolBindingService();
  await bindings.upsert(agent.id, {
    source: 'mcp',
    serverId: connection.serverId,
    approval: 'ask',
    enabled: true,
  });
  await expect(service.disconnect('github')).resolves.toEqual({
    serverId: connection.serverId,
    keyId: 'plugin.key-1',
  });
  expect(await service.listConnections()).toEqual([]);
  expect((await bindings.list(agent.id)).items).toEqual([
    expect.objectContaining({ enabled: false, serverId: connection.serverId }),
  ]);
  const next = await service.connect(input);
  expect(next.connection.serverId).not.toBe(connection.serverId);
});

it('rejects remote retargeting and generic deletion of a plugin server', async () => {
  const { connection } = await service.connect(input);
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
  const { connection } = await service.connect(input);
  const update = db.sqlite.prepare('UPDATE mcp_server SET base_url = ? WHERE id = ?');
  expect(() => update.run('https://remote.example/mcp', connection.serverId)).toThrow();
  expect(() => db.sqlite.exec('DELETE FROM plugin_authorization')).toThrow();
  expect(() => db.sqlite.exec("UPDATE plugin_authorization SET auth_method = 'api_key'")).toThrow();
  expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
