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
  authMethod: 'personal_token',
  serverName: 'GitHub',
  accountLabel: 'cherry',
  credential: { version: 1, token: 'ghp_first' },
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
  expect(JSON.stringify(connection)).not.toContain('ghp_first');
  expect(JSON.stringify(server)).not.toContain('ghp_first');
});

it('persists Feishu application credentials without exposing them in connection or MCP data', async () => {
  const credential = { version: 1, appId: 'cli_cherry', appSecret: 'private-secret' };
  const connection = await service.connect({
    pluginId: 'feishu',
    authMethod: 'app_credentials',
    serverName: 'Feishu',
    accountLabel: 'cli_cherry',
    credential,
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
    auth_method: 'app_credentials',
    credential: JSON.stringify(credential),
  });
  expect(JSON.stringify(await service.listConnections())).not.toContain('private-secret');
  expect(JSON.stringify(server)).not.toContain('private-secret');
});

it('rotates grant identity without retargeting an old credential reference', async () => {
  const first = await service.connect(input);
  const oldServer = await new McpServerService().getById(first.serverId);
  if (oldServer.origin !== 'builtin') throw new Error('Expected a plugin');
  const second = await service.connect({
    ...input,
    credential: { version: 1, token: 'ghp_second' },
  });
  expect(second.serverId).toBe(first.serverId);
  await expect(service.getCredentialGrant('github', oldServer.authorizationId)).rejects.toThrow();
  const newServer = await new McpServerService().getById(second.serverId);
  if (newServer.origin !== 'builtin') throw new Error('Expected a plugin');
  expect(
    (await service.getCredentialGrant('github', newServer.authorizationId)).credential,
  ).toEqual({ version: 1, token: 'ghp_second' });
  expect(db.sqlite.prepare('SELECT count(*) AS count FROM plugin_authorization').get()).toEqual({
    count: 1,
  });
});

it('retains disabled grants for backend renewal without making them executable', async () => {
  const credential = { version: 1, tokens: { accessToken: 'access', refreshToken: 'refresh' } };
  const connection = await service.connect({
    ...input,
    pluginId: 'feishu',
    authMethod: 'feishu_user',
    credential,
  });
  const server = await new McpServerService().getById(connection.serverId);
  if (server.origin !== 'builtin') throw new Error('Expected a plugin');
  await new McpServerService().update(connection.serverId, { isEnabled: false });
  expect(await service.getCurrentGrant('feishu', 'feishu_user')).toMatchObject({ credential });
  await expect(service.getCredentialGrant('feishu', server.authorizationId)).rejects.toThrow();
  expect(await service.getCurrentGrant('github', 'personal_token')).toBeUndefined();
  await service.disconnect('feishu');
  expect(await service.getCurrentGrant('feishu', 'feishu_user')).toBeUndefined();
});

it('rolls back both the grant and server when committing a credential change fails', async () => {
  const first = await service.connect(input);
  const oldServer = await new McpServerService().getById(first.serverId);
  db.failWriteTxCommit(new Error('disk full'));
  await expect(
    service.connect({ ...input, credential: { version: 1, token: 'ghp_second' } }),
  ).rejects.toThrow('disk full');
  expect(await new McpServerService().getById(first.serverId)).toEqual(oldServer);
  expect(db.sqlite.prepare('SELECT credential FROM plugin_authorization').all()).toEqual([
    { credential: JSON.stringify({ version: 1, token: 'ghp_first' }) },
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
    credential: { version: 2, secret: 'private' },
  });
  const server = await new McpServerService().getById(connection.serverId);
  expect(server).toMatchObject({ builtinId: 'vendor.future-plugin', name: 'Future plugin' });
  expect(await service.listConnections()).toEqual([connection]);
  await service.disconnect('vendor.future-plugin');
  expect(await service.listConnections()).toEqual([]);
  expect(db.sqlite.prepare('SELECT * FROM plugin_authorization').all()).toEqual([]);
});

it('rolls back the credential, connection and pending state together when interactive completion fails', async () => {
  const store = service.authorizationStore('feishu', 'feishu_user', 'Feishu');
  const credential = {
    version: 1,
    application: { appId: 'cli_cherry', appSecret: 'secret' },
    tokens: { accessToken: 'access', refreshToken: 'refresh', expiresAt: 1000 },
  };
  const candidate = { version: 1, application: credential.application, pending: { credential } };
  const completed = { version: 1, application: credential.application };
  await store.writeState(candidate);
  db.failWriteTxCommit(new Error('disk full'));
  await expect(
    store.commit(credential, 'Cherry', completed, new AbortController().signal),
  ).rejects.toThrow('disk full');
  expect(await store.readState()).toEqual(candidate);
  expect(await service.listConnections()).toEqual([]);
  await store.commit(credential, 'Cherry', completed, new AbortController().signal);
  expect(await store.readState()).toEqual(completed);
  expect((await store.getGrant())?.credential).toEqual(credential);
  expect(JSON.stringify(await service.listConnections())).not.toMatch(/refresh|secret/);
});

it('atomically replaces a token object only while the expected grant and credential still match', async () => {
  const store = service.authorizationStore('github', 'personal_token', 'GitHub');
  const connection = await service.connect(input);
  const original = (await store.getGrant())!;
  const next = {
    version: 1,
    token: 'second',
    nested: { refreshToken: 'refresh', expiresAt: 2000 },
  };
  const signal = new AbortController().signal;
  await expect(store.updateCredential(original, next, signal)).resolves.toBe(true);
  expect(await store.getGrant()).toEqual({ id: original.id, credential: next });
  await expect(
    store.updateCredential(original, { version: 1, token: 'stale' }, signal),
  ).resolves.toBe(false);
  expect((await service.listConnections())[0].serverId).toBe(connection.serverId);
  await service.connect({ ...input, credential: { version: 1, token: 'replacement' } });
  await expect(
    store.updateCredential({ id: original.id, credential: next }, input.credential, signal),
  ).resolves.toBe(false);
  const replacement = (await store.getGrant())!;
  await service.disconnect('github');
  await expect(store.updateCredential(replacement, input.credential, signal)).resolves.toBe(false);
  expect(await store.getGrant()).toBeUndefined();
});

it('rolls back a failed token rotation and rejects an owner-cancelled write', async () => {
  const store = service.authorizationStore('github', 'personal_token', 'GitHub');
  await service.connect(input);
  const grant = (await store.getGrant())!;
  db.failWriteTxCommit(new Error('disk full'));
  await expect(
    store.updateCredential(grant, { version: 1, token: 'next' }, new AbortController().signal),
  ).rejects.toThrow('disk full');
  expect(await store.getGrant()).toEqual(grant);
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    store.updateCredential(grant, { version: 1, token: 'cancelled' }, cancelled.signal),
  ).rejects.toThrow();
  expect(await store.getGrant()).toEqual(grant);
});

it('isolates method state and keeps reusable application data after disconnect', async () => {
  const first = service.authorizationStore('github', 'personal_token', 'GitHub');
  const second = service.authorizationStore('github', 'future_oauth', 'GitHub');
  await first.writeState({ version: 1, application: { clientId: 'existing-app' } });
  await second.writeState({ version: 2, application: { clientId: 'oauth-app' } });
  await service.connect(input);
  await service.disconnect('github');
  expect(await first.readState()).toEqual({
    version: 1,
    application: { clientId: 'existing-app' },
  });
  expect(await second.readState()).toEqual({ version: 2, application: { clientId: 'oauth-app' } });
});

it('imports legacy state and credential atomically without replacing a newer initialization', async () => {
  const store = service.authorizationStore('feishu', 'feishu_user', 'Feishu');
  await service.connect({
    ...input,
    pluginId: 'feishu',
    authMethod: 'feishu_user',
    credential: { legacyReference: 'feishu-user:old' },
  });
  const previous = (await store.getGrant())!;
  const credential = { version: 1, tokens: { accessToken: 'access', refreshToken: 'refresh' } };
  db.failWriteTxCommit(new Error('disk full'));
  await expect(store.initializeState({ version: 1 }, { previous, credential })).rejects.toThrow(
    'disk full',
  );
  expect(await store.readState()).toBeUndefined();
  expect(await store.getGrant()).toEqual(previous);
  await store.initializeState({ version: 1 }, { previous, credential });
  expect(await store.getGrant()).toEqual({ id: previous.id, credential });
  await store.initializeState({ version: 2 }, { previous, credential: { version: 2 } });
  expect(await store.readState()).toEqual({ version: 1 });
  expect((await store.getGrant())?.credential).toEqual(credential);
});

it('rejects non-object and non-JSON credentials before writing a connection', async () => {
  for (const credential of [
    'plain-token',
    ['token'],
    { token: undefined },
    { token: () => 'secret' },
  ]) {
    await expect(service.connect({ ...input, credential: credential as never })).rejects.toThrow();
  }
  expect(await service.listConnections()).toEqual([]);
});
