import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migrationRoot = `${process.cwd()}/migrations/sqlite-drizzle`;
const journal = JSON.parse(readFileSync(`${migrationRoot}/meta/_journal.json`, 'utf8')) as {
  entries: { tag: string }[];
};
const run = (db: DatabaseSync, tag: string) => {
  for (const sql of readFileSync(`${migrationRoot}/${tag}.sql`, 'utf8').split(
    '--> statement-breakpoint',
  ))
    if (sql.trim()) db.exec(sql);
};

it('migrates paired desktops inside a transaction without cascading their cached sessions or retaining auto addresses', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const next = journal.entries.findIndex(({ tag }) => tag.startsWith('0003_'));
    for (const { tag } of journal.entries.slice(0, next)) run(db, tag);
    db.exec(`INSERT INTO desktop_connection(id,name,device_id,desktop_identity,addresses,port,grants,status,created_at,updated_at)
      VALUES('desktop','Work','phone','peer1','["10.0.0.2"]',23333,'[{"domain":"agent","grantId":"grant1"}]','paired',1,2);
      INSERT INTO remote_session_projection(connection_id,scope_id,session_id,stream_epoch,seq,projection,updated_at)
      VALUES('desktop','scope','session','epoch','42','{"pendingCommand":"command1","draft":"hello"}',3);`);
    db.exec('BEGIN');
    for (const { tag } of journal.entries.slice(next)) run(db, tag);
    db.exec('COMMIT');
    expect(db.prepare('SELECT * FROM desktop_connection').get()).toEqual(
      expect.objectContaining({
        id: 'desktop',
        device_id: 'phone',
        desktop_identity: 'peer1',
        configured_endpoints: '[]',
        grants: '[{"domain":"agent","grantId":"grant1"}]',
        status: 'paired',
        created_at: 1,
      }),
    );
    expect(db.prepare('SELECT * FROM remote_session_projection').get()).toEqual(
      expect.objectContaining({
        scope_id: 'scope',
        seq: '42',
        projection: '{"pendingCommand":"command1","draft":"hello"}',
      }),
    );
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.exec(`INSERT INTO desktop_connection(id,name,device_id,desktop_identity,grants,created_at,updated_at)
      VALUES('new','New','phone2','peer2','[]',1,1)`);
    expect(
      db.prepare("SELECT configured_endpoints FROM desktop_connection WHERE id='new'").get(),
    ).toEqual({ configured_endpoints: '[]' });
  } finally {
    db.close();
  }
});
