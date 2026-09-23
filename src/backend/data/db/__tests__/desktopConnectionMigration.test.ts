import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migrationRoot = `${process.cwd()}/migrations/sqlite-drizzle`;

it('replaces legacy HTTP connections with the final pairing schema and preserves unrelated data', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(readFileSync(`${migrationRoot}/0000_initial.sql`, 'utf8'));
    db.exec(`
      INSERT INTO desktop_connection(id,name,base_urls,active_base_url,desktop_version,created_at,updated_at)
      VALUES('legacy','Work','["http://pc.local"]','http://pc.local','1',1,2);
      INSERT INTO preference(key,value,created_at,updated_at)
      VALUES('ui.theme_mode','"dark"',1,2);
    `);

    db.exec('BEGIN');
    db.exec(readFileSync(`${migrationRoot}/0001_hot_cammi.sql`, 'utf8'));
    db.exec('COMMIT');

    expect(db.prepare('SELECT * FROM desktop_connection').all()).toEqual([]);
    expect(db.prepare('SELECT key,value FROM preference').all()).toEqual([
      { key: 'ui.theme_mode', value: '"dark"' },
    ]);
    db.exec(`
      INSERT INTO desktop_connection(id,name,device_id,desktop_identity,grants,created_at,updated_at)
      VALUES('paired','Work','phone','peer','[]',1,2);
    `);
    expect(db.prepare('SELECT configured_endpoints,status FROM desktop_connection').get()).toEqual({
      configured_endpoints: '[]',
      status: 'paired',
    });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  } finally {
    db.close();
  }
});
