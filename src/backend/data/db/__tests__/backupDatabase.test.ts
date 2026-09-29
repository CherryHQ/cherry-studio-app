import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import { readBackupSchema, restoreDeviceState } from '../backupDatabase';

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
      VALUES ('complete', 'session', 'assistant', '{"version":1,"parts":[]}', 'success', 1, 1),
             ('partial', 'session', 'assistant', '{"version":1,"parts":[]}', 'streaming', 1, 1);
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
             ('app.privacy.data_collection.enabled', 'true', 1, 1);
  `);
  const adapter = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...params: SQLInputValue[]) => raw.prepare(sql).run(...params),
    getAllAsync: async (sql: string, ...params: (SQLInputValue | SQLInputValue[])[]) =>
      raw.prepare(sql).all(...params.flat()),
  } as unknown as SQLiteDatabase;
  return { raw, adapter };
}

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
      { key: 'app.privacy.data_collection.enabled', value: 'false' },
      { key: 'app.user.id', value: '"target-device"' },
      { key: 'ui.theme_mode', value: '"dark"' },
    ]);
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
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
