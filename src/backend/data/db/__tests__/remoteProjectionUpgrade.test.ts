import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

const migrationRoot = `${process.cwd()}/migrations/sqlite-drizzle`;
const journal = JSON.parse(readFileSync(`${migrationRoot}/meta/_journal.json`, 'utf8')) as {
  entries: { idx: number; tag: string; when: number; breakpoints: boolean }[];
};
const migrations = journal.entries.map((entry) => ({
  sql: readFileSync(`${migrationRoot}/${entry.tag}.sql`, 'utf8').split('--> statement-breakpoint'),
  folderMillis: entry.when,
  bps: entry.breakpoints,
  hash: '',
}));

// Exercise Drizzle's actual timestamp selection and transaction logic against SQLite.
// Only the native statement adapter is replaced with Node's SQLite implementation.
function migrate(db: DatabaseSync, indices: number[]) {
  const dialect = new SQLiteSyncDialect();
  const prepare = (query: SQL) => {
    const { sql, params } = dialect.sqlToQuery(query);
    return { statement: db.prepare(sql), params: params as SQLInputValue[] };
  };
  const session = {
    run(query: SQL) {
      const { statement, params } = prepare(query);
      return statement.run(...params);
    },
    values(query: SQL) {
      const { statement, params } = prepare(query);
      return statement.all(...params).map(Object.values);
    },
  };
  dialect.migrate(
    migrations.filter((_, index) => indices.includes(journal.entries[index].idx)),
    session as unknown as Parameters<SQLiteSyncDialect['migrate']>[1],
  );
}

const allIndices = journal.entries.map(({ idx }) => idx);

it('adds Agent persistence after the connection foundation without changing pairing data', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db, [0, 1]);
    db.exec(`INSERT INTO desktop_connection(id,name,device_id,desktop_identity,grants,configured_endpoints,created_at,updated_at)
      VALUES('desktop','Work','phone','peer','[{"domain":"agent","grantId":"grant"}]','[{"host":"pc.local","port":23333,"security":"ws"}]',1,2)`);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='remote_session_projection'").get(),
    ).toBeUndefined();

    migrate(db, allIndices);
    db.exec(
      `INSERT INTO remote_session_projection VALUES('desktop','grant','session','epoch','42','{}',3)`,
    );
    const paired = db.prepare('SELECT * FROM desktop_connection').get();
    expect(paired).toMatchObject({
      desktop_identity: 'peer',
      grants: '[{"domain":"agent","grantId":"grant"}]',
      configured_endpoints: '[{"host":"pc.local","port":23333,"security":"ws"}]',
    });
    migrate(db, allIndices);
    expect(db.prepare('SELECT * FROM desktop_connection').get()).toEqual(paired);
    expect(db.prepare('SELECT seq FROM remote_session_projection').get()).toEqual({ seq: '42' });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.exec("DELETE FROM desktop_connection WHERE id='desktop'");
    expect(db.prepare('SELECT * FROM remote_session_projection').all()).toEqual([]);
  } finally {
    db.close();
  }
});
