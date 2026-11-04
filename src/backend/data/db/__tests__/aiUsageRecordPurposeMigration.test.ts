import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('adds the purpose sidecar without changing historical ledger rows', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
    const journal = JSON.parse(readFileSync(`${directory}/meta/_journal.json`, 'utf8')) as {
      entries: { tag: string }[];
    };
    for (const { tag } of journal.entries.filter(({ tag }) => !tag.startsWith('0013_'))) {
      for (const sql of readFileSync(`${directory}/${tag}.sql`, 'utf8').split(
        '--> statement-breakpoint',
      ))
        if (sql.trim()) db.exec(sql);
    }
    db.exec(`INSERT INTO ai_usage_record (id, request_id, record_kind, request_count, provider_id, model_id, modality, api_key_attribution, created_at) VALUES ('one', 'one', 'invocation', 1, 'p', 'm', 'language', 'unknown', 1);
      INSERT INTO ai_usage_record (id, request_id, record_kind, request_count, message_kind, message_id, modality, api_key_attribution, created_at) VALUES ('two', 'two', 'legacy-aggregate', 2, 'chat', 'msg', 'language', 'unknown', 2);`);
    const rows = db.prepare('SELECT * FROM ai_usage_record ORDER BY id').all();
    const columns = db.prepare("PRAGMA table_info('ai_usage_record')").all();
    db.exec(readFileSync(`${directory}/0013_ai_usage_record_purpose.sql`, 'utf8'));
    expect(db.prepare('SELECT * FROM ai_usage_record ORDER BY id').all()).toEqual(rows);
    expect(db.prepare("PRAGMA table_info('ai_usage_record')").all()).toEqual(columns);
    expect(columns).toHaveLength(37);
    expect(db.prepare("PRAGMA table_info('ai_usage_record_purpose')").all()).toEqual([
      expect.objectContaining({ name: 'request_id', type: 'TEXT', notnull: 1, pk: 1 }),
      expect.objectContaining({ name: 'purpose', type: 'TEXT', notnull: 1, pk: 0 }),
    ]);
    expect(db.prepare("PRAGMA foreign_key_list('ai_usage_record_purpose')").all()).toEqual([
      expect.objectContaining({
        table: 'ai_usage_record',
        from: 'request_id',
        to: 'request_id',
        on_delete: 'CASCADE',
      }),
    ]);
    expect(() => db.exec("INSERT INTO ai_usage_record_purpose VALUES ('one', 'invalid')")).toThrow(
      /ai_usage_record_purpose_purpose_check/,
    );
    db.exec("INSERT INTO ai_usage_record_purpose VALUES ('one', 'translation')");
    db.exec("DELETE FROM ai_usage_record WHERE request_id = 'one'");
    expect(db.prepare('SELECT * FROM ai_usage_record_purpose').all()).toEqual([]);
  } finally {
    db.close();
  }
});
