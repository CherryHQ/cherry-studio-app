import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('adds SSH metadata to an existing database without persisting credentials or changing conversations', () => {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(readFileSync(`${directory}/meta/_journal.json`, 'utf8')) as {
    entries: { tag: string }[];
  };
  const database = new DatabaseSync(':memory:');
  const apply = (tag: string) => {
    for (const statement of readFileSync(`${directory}/${tag}.sql`, 'utf8').split(
      '--> statement-breakpoint',
    ))
      if (statement.trim()) database.exec(statement);
  };
  try {
    const index = journal.entries.findIndex(({ tag }) => tag === '0013_ssh_profiles');
    expect(index).toBeGreaterThan(0);
    for (const { tag } of journal.entries.slice(0, index)) apply(tag);
    database.exec(
      "INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('existing', 'Chat', 'a0', 1, 1)",
    );
    for (const { tag } of journal.entries.slice(index)) apply(tag);
    expect(database.prepare('SELECT id, name FROM agent').all()).toEqual([
      { id: 'existing', name: 'Chat' },
    ]);
    const columns = database
      .prepare('PRAGMA table_info(ssh_profile)')
      .all()
      .map((row) => row.name);
    expect(columns).toEqual([
      'id',
      'revision',
      'name',
      'host',
      'port',
      'username',
      'auth_method',
      'credential_reference',
      'fingerprint',
      'created_at',
      'updated_at',
    ]);
    expect(columns).not.toEqual(expect.arrayContaining(['password', 'private_key']));
    database.exec(
      "INSERT INTO ssh_profile (id, revision, name, host, username, auth_method, credential_reference, created_at, updated_at) VALUES ('ssh', 'revision', 'Router', 'router.local', 'admin', 'password', 'opaque-keychain-reference', 1, 1)",
    );
    expect(database.prepare('SELECT port, fingerprint FROM ssh_profile').get()).toEqual({
      port: 22,
      fingerprint: null,
    });
  } finally {
    database.close();
  }
});
