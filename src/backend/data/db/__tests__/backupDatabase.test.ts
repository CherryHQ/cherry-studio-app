import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  type ActiveProfile,
  type EnterpriseIdentity,
  LOCAL_PROFILE,
  setActiveProfile,
} from '@/shared/data/activeProfile';

import {
  assertBackupBelongsToActiveProfile,
  readBackupSchema,
  restoreDeviceState,
  prepareEnterpriseBackup,
} from '../backupDatabase';

function database() {
  const raw = new DatabaseSync(':memory:');
  const journal = JSON.parse(
    readFileSync(`${process.cwd()}/migrations/sqlite-drizzle/meta/_journal.json`, 'utf8'),
  ) as { entries: { tag: string }[] };
  for (const entry of journal.entries)
    raw.exec(readFileSync(`${process.cwd()}/migrations/sqlite-drizzle/${entry.tag}.sql`, 'utf8'));
  raw.exec(`
    INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('agent', 'Agent', 'a0', 1, 1);
    INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at) VALUES ('session', 'agent', 1, 1, 1);
    INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at)
      VALUES ('complete', 'session', 'assistant', '{"parts":[]}', 'success', 1, 1),
             ('partial', 'session', 'assistant', '{"parts":[]}', 'streaming', 1, 1);
    INSERT INTO job (id, type, status, queue, scheduled_at, input, created_at, updated_at)
      VALUES ('active', 'test', 'running', 'test', 1, '{}', 1, 1), ('finished', 'test', 'completed', 'test', 1, '{}', 1, 1);
    INSERT INTO plugin_authorization (id, plugin_id, auth_method, account_label, credential, created_at, updated_at)
      VALUES ('plugin', 'feishu', 'feishu_user', 'Account', '{"storage":"secure-store-v1","id":"10000000-0000-4000-8000-000000000001"}', 1, 1);
    INSERT INTO mcp_server (id, name, origin, builtin_id, authorization_id, created_at, updated_at)
      VALUES ('mcp', 'Feishu', 'builtin', 'feishu', 'plugin', 1, 1);
    INSERT INTO desktop_connection (id, name, device_id, desktop_identity, grants, status, created_at, updated_at)
      VALUES ('desktop', 'Desktop', 'phone', 'peer', '[]', 'paired', 1, 1);
    INSERT INTO preference (key, value, created_at, updated_at)
      VALUES ('ui.theme_mode', '"dark"', 1, 1), ('app.user.id', '"source-device"', 1, 1),
             ('app.privacy.data_collection.enabled', 'true', 1, 1),
             ('app.feedback.shake_enabled', 'true', 1, 1),
             ('app.feedback.shake_hint_decision', '"accepted"', 1, 1);
  `);
  const adapter = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...params: SQLInputValue[]) => raw.prepare(sql).run(...params),
    getFirstAsync: async (sql: string, ...params: (SQLInputValue | SQLInputValue[])[]) =>
      raw.prepare(sql).get(...params.flat()) ?? null,
    getAllAsync: async (sql: string, ...params: (SQLInputValue | SQLInputValue[])[]) =>
      raw.prepare(sql).all(...params.flat()),
  } as unknown as SQLiteDatabase;
  return { raw, adapter };
}

test('restore clears orphan workspace bindings while preserving existing trashed folders', async () => {
  const { raw, adapter } = database();
  try {
    // A restored backup can carry a dangling binding; node:sqlite enforces keys by default.
    raw.exec("PRAGMA foreign_keys = OFF; UPDATE agent_session SET workspace_folder_id = 'missing'");
    await restoreDeviceState(adapter, []);
    expect(raw.prepare('SELECT workspace_folder_id FROM agent_session').get()).toEqual({
      workspace_folder_id: null,
    });
    raw.exec(
      "INSERT INTO file_folder (id, name, name_key, created_at, updated_at, deleted_at) VALUES ('folder', 'Reports', 'reports', 1, 1, 2); UPDATE agent_session SET workspace_folder_id = 'folder'",
    );
    await restoreDeviceState(adapter, []);
    expect(raw.prepare('SELECT workspace_folder_id FROM agent_session').get()).toEqual({
      workspace_folder_id: 'folder',
    });
  } finally {
    raw.close();
  }
});

test('restore preserves message-owned translations together with the original parts', async () => {
  const { raw, adapter } = database();
  try {
    const data = JSON.stringify({
      parts: [],
      translations: {
        sourceHash: 'a'.repeat(64),
        results: { 'zh-CN': { content: '保留译文', createdAt: 1 } },
      },
    });
    raw.prepare('UPDATE agent_session_message SET data = ? WHERE id = ?').run(data, 'complete');
    await restoreDeviceState(adapter, []);
    expect(
      raw.prepare("SELECT data FROM agent_session_message WHERE id = 'complete'").get(),
    ).toEqual({ data });
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    raw.close();
  }
});

test('schema comparison includes extra triggers whose names resemble SQLite internals or FTS shadow tables', async () => {
  const { raw, adapter } = database();
  try {
    const expected = await readBackupSchema(adapter);
    for (const name of ['sqliteHidden', 'agent_session_message_fts_config']) {
      raw.exec(
        `CREATE TRIGGER ${name} AFTER UPDATE ON plugin_authorization BEGIN DELETE FROM preference; END`,
      );
      expect(await readBackupSchema(adapter)).not.toBe(expected);
      raw.exec(`DROP TRIGGER ${name}`);
    }
  } finally {
    raw.close();
  }
});

test('schema comparison ignores custom SQL triggers that the running bundle recreates', async () => {
  const { raw, adapter } = database();
  try {
    raw.exec(
      'CREATE TRIGGER agent_session_message_ad AFTER DELETE ON agent_session_message BEGIN SELECT 1; END',
    );
    const expected = await readBackupSchema(adapter);
    raw.exec('DROP TRIGGER agent_session_message_ad');
    raw.exec(
      'CREATE TRIGGER agent_session_message_ad AFTER DELETE ON agent_session_message BEGIN SELECT 2; END',
    );
    expect(await readBackupSchema(adapter)).toBe(expected);
  } finally {
    raw.close();
  }
});

test('preserves content and portable settings, but never resumes work or imports device-bound identity', async () => {
  const { raw, adapter } = database();
  try {
    await restoreDeviceState(adapter, [
      { key: 'app.user.id', value: '"target-device"' },
      { key: 'app.feedback.shake_enabled', value: 'false' },
      { key: 'app.feedback.shake_hint_decision', value: '"ignored"' },
      { key: 'app.privacy.data_collection.enabled', value: 'false' },
    ]);
    expect(raw.prepare('SELECT id, status FROM agent_session_message ORDER BY id').all()).toEqual([
      { id: 'complete', status: 'success' },
      { id: 'partial', status: 'interrupted' },
    ]);
    expect(raw.prepare('SELECT id, status FROM job ORDER BY id').all()).toEqual([
      { id: 'active', status: 'cancelled' },
      { id: 'finished', status: 'completed' },
    ]);
    expect(raw.prepare('SELECT * FROM desktop_connection').all()).toEqual([]);
    expect(raw.prepare('SELECT authorization_id FROM mcp_server').get()).toEqual({
      authorization_id: 'plugin',
    });
    const grant = raw.prepare('SELECT credential FROM plugin_authorization').get() as {
      credential: string;
    };
    expect(JSON.parse(grant.credential)).toMatchObject({ storage: 'secure-store-v1' });
    expect(JSON.parse(grant.credential).id).not.toBe('10000000-0000-4000-8000-000000000001');
    expect(raw.prepare('SELECT key, value FROM preference ORDER BY key').all()).toEqual([
      { key: 'app.feedback.shake_enabled', value: 'false' },
      { key: 'app.feedback.shake_hint_decision', value: '"ignored"' },
      { key: 'app.privacy.data_collection.enabled', value: 'false' },
      { key: 'app.user.id', value: '"target-device"' },
      { key: 'ui.theme_mode', value: '"dark"' },
    ]);
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    raw.close();
  }
});

test('restore requires fresh remote MCP OAuth without changing manual connections', async () => {
  const { raw, adapter } = database();
  try {
    const originalId = '00000000-0000-4000-8000-000000000001';
    raw
      .prepare(
        'INSERT INTO mcp_server (id, name, base_url, oauth, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)',
      )
      .run(
        'remote-oauth',
        'OAuth',
        'https://example.com/mcp',
        JSON.stringify({ authorizationId: originalId, clientId: 'public-client' }),
      );
    raw.exec(`
      INSERT INTO mcp_server (id, name, base_url, headers, is_active, created_at, updated_at)
      VALUES ('manual', 'Manual', 'https://manual.example/mcp', '{"X-API-Key":"manual-key"}', 1, 1, 1);
    `);

    await restoreDeviceState(adapter, []);
    const restored = raw
      .prepare("SELECT oauth, is_active FROM mcp_server WHERE id = 'remote-oauth'")
      .get() as { oauth: string; is_active: number };
    expect(JSON.parse(restored.oauth)).toEqual({
      authorizationId: expect.any(String),
      clientId: 'public-client',
    });
    expect(JSON.parse(restored.oauth).authorizationId).not.toBe(originalId);
    expect(restored.is_active).toBe(0);
    expect(
      raw.prepare("SELECT oauth, headers, is_active FROM mcp_server WHERE id = 'manual'").get(),
    ).toEqual({ oauth: null, headers: '{"X-API-Key":"manual-key"}', is_active: 1 });
  } finally {
    raw.close();
  }
});

test('a normalization failure rolls back execution state, credentials and pairing together', async () => {
  const { raw, adapter } = database();
  try {
    raw.exec(
      "CREATE TRIGGER fail_normalization BEFORE UPDATE ON plugin_authorization BEGIN SELECT RAISE(ABORT, 'disk write failed'); END",
    );
    await expect(restoreDeviceState(adapter, [])).rejects.toThrow('disk write failed');
    expect(raw.prepare("SELECT status FROM job WHERE id = 'active'").get()).toEqual({
      status: 'running',
    });
    expect(
      raw.prepare("SELECT status FROM agent_session_message WHERE id = 'partial'").get(),
    ).toEqual({ status: 'streaming' });
    expect(raw.prepare('SELECT id FROM desktop_connection').get()).toEqual({ id: 'desktop' });
    expect(raw.prepare("SELECT value FROM preference WHERE key = 'app.user.id'").get()).toEqual({
      value: '"source-device"',
    });
  } finally {
    raw.close();
  }
});

describe('enterprise backups', () => {
  const identity: EnterpriseIdentity = {
    deployment: 'server-1',
    issuer: 'https://auth',
    subject: 'user-1',
    productProfileId: 'org-1',
  };
  const profile = (value: EnterpriseIdentity): ActiveProfile => ({
    id: '00000000-0000-4000-8000-000000000001',
    identity: value,
    address: 'https://enterprise.example.com',
  });
  const managedData = `
    INSERT INTO user_provider (provider_id, name, api_keys, order_key, created_at, updated_at)
      VALUES ('openai', 'OpenAI', '[{"id":"enterprise-gateway","key":"gateway-secret","isEnabled":true}]', 'a0', 1, 1);
    INSERT INTO user_model (id, provider_id, model_id, preset_model_id, order_key, created_at, updated_at)
      VALUES ('openai::gpt', 'openai', 'gpt', 'gpt', 'a0', 1, 1);
    UPDATE agent SET managed_remote_id = '7', instructions = 'Organization prompt', model = 'openai::gpt';
    UPDATE agent_session_message SET model_id = 'openai::gpt';
    INSERT INTO mcp_server (id, name, base_url, headers, managed_remote_id, created_at, updated_at)
      VALUES ('managed-mcp', 'Org tools', 'https://tools', '{"Authorization":"Bearer tool-secret"}', '3', 1, 1),
             ('own-mcp', 'My tools', 'https://mine', NULL, NULL, 1, 1);
    INSERT INTO agent_tool_binding (id, agent_id, source, mcp_server_id, created_at, updated_at)
      VALUES ('managed-binding', 'agent', 'mcp', 'managed-mcp', 1, 1), ('own-binding', 'agent', 'mcp', 'own-mcp', 1, 1);
    INSERT INTO agent_global_skill (id, name, folder_name, source, content_hash, manifest, profile, managed_remote_id, created_at, updated_at)
      VALUES ('managed-skill', 'Org skill', 'org', 'enterprise', 'h', '[]', '{}', '5', 1, 1);
    INSERT INTO agent_skill (agent_id, skill_id, created_at, updated_at) VALUES ('agent', 'managed-skill', 1, 1);
    INSERT INTO preference (key, value, created_at, updated_at) VALUES ('agent.default_model_id', '"openai::gpt"', 1, 1);
    INSERT INTO app_state (key, value, created_at, updated_at) VALUES ('enterprise.sync', '{"hash":"h","syncIntervalMinutes":10,"skills":{}}', 1, 1);
  `;
  const count = (raw: DatabaseSync, sql: string) =>
    (raw.prepare(`SELECT COUNT(*) AS count FROM ${sql}`).get() as { count: number }).count;

  afterEach(() => setActiveProfile(LOCAL_PROFILE));

  test('keeps conversations and Agents but no organization credentials or other delivered resources', async () => {
    const { raw, adapter } = database();
    try {
      raw.exec(managedData);
      setActiveProfile(profile(identity));
      await prepareEnterpriseBackup(adapter);
      expect(raw.prepare('SELECT api_keys FROM user_provider').get()).toEqual({ api_keys: '[]' });
      // Agents and messages keep their model references; the sync rewrites the rows after restore.
      expect(raw.prepare('SELECT model FROM agent').get()).toEqual({ model: 'openai::gpt' });
      expect(count(raw, "agent_session_message WHERE model_id = 'openai::gpt'")).toBe(2);
      expect(raw.prepare('SELECT id FROM mcp_server ORDER BY id').all()).toEqual([
        { id: 'mcp' },
        { id: 'own-mcp' },
      ]);
      expect(raw.prepare('SELECT id FROM agent_tool_binding').all()).toEqual([
        { id: 'own-binding' },
      ]);
      expect(count(raw, 'agent_global_skill')).toBe(0);
      expect(count(raw, 'agent_skill')).toBe(0);
      expect(count(raw, "preference WHERE key = 'agent.default_model_id'")).toBe(0);
      expect(raw.prepare('SELECT key FROM app_state').all()).toEqual([{ key: 'backup.profile' }]);

      await expect(assertBackupBelongsToActiveProfile(adapter)).resolves.toBeUndefined();
      await restoreDeviceState(adapter, []);
      expect(raw.prepare('SELECT managed_remote_id, instructions FROM agent').get()).toEqual({
        managed_remote_id: '7',
        instructions: 'Organization prompt',
      });
      // Without a sync state, the restored profile syncs before it opens.
      expect(count(raw, 'app_state')).toBe(0);
    } finally {
      raw.close();
    }
  });

  test('leaves local data untouched', async () => {
    const { raw, adapter } = database();
    try {
      raw.exec(managedData);
      await prepareEnterpriseBackup(adapter);
      expect(count(raw, 'mcp_server')).toBe(3);
      expect(count(raw, "user_provider WHERE api_keys LIKE '%gateway-secret%'")).toBe(1);
    } finally {
      raw.close();
    }
  });

  test.each<[string, ActiveProfile]>([
    ['local data', LOCAL_PROFILE],
    ['another organization', profile({ ...identity, productProfileId: 'org-2' })],
    [
      'a private sign-in to the same server',
      profile({ deployment: 'server-1', subject: 'user-1', authentication: 'password' }),
    ],
  ])('refuses to restore into %s', async (_, target) => {
    const { raw, adapter } = database();
    try {
      setActiveProfile(profile(identity));
      await prepareEnterpriseBackup(adapter);
      setActiveProfile(target);
      await expect(assertBackupBelongsToActiveProfile(adapter)).rejects.toMatchObject({
        code: 'other-account',
      });
    } finally {
      raw.close();
    }
  });

  test('restores local data into an enterprise profile, whose providers come from the next sync', async () => {
    const { raw, adapter } = database();
    try {
      raw.exec(managedData);
      await prepareEnterpriseBackup(adapter);
      setActiveProfile(profile(identity));
      await expect(assertBackupBelongsToActiveProfile(adapter)).resolves.toBeUndefined();
      await restoreDeviceState(adapter, []);
      expect(raw.prepare('SELECT COUNT(*) AS count FROM user_provider').get()).toEqual({
        count: 0,
      });
      expect(raw.prepare('SELECT COUNT(*) AS count FROM app_state').get()).toEqual({ count: 0 });
    } finally {
      raw.close();
    }
  });
});
