import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { backfillSearchableText, customSqlStatements } from '../customSql';

type MigrationJournal = { entries: { tag: string }[] };

describe('searchable text backfill', () => {
  let database: DatabaseSync;
  const sqlite = {
    execSync: (source: string) => database.exec(source),
    getAllSync: (source: string, ...params: SQLInputValue[]) =>
      database.prepare(source).all(...params),
    runSync: (source: string, ...params: SQLInputValue[]) =>
      database.prepare(source).run(...params),
  } as unknown as Parameters<typeof backfillSearchableText>[0];

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
    const journal = JSON.parse(
      readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
    ) as MigrationJournal;
    for (const { tag } of journal.entries) {
      for (const statement of readFileSync(`${directory}/${tag}.sql`, 'utf8').split(
        '--> statement-breakpoint',
      )) {
        if (statement.trim()) database.exec(statement);
      }
    }
    for (const statement of customSqlStatements) database.exec(statement);
    database.exec(`INSERT INTO agent (id, name, order_key, created_at, updated_at)
      VALUES ('agent', 'Agent', 'a0', 1, 1);
      INSERT INTO agent_session (id, agent_id, name, last_activity_at, created_at, updated_at)
      VALUES ('session', 'agent', 'Session', 1, 1, 1);`);
  });

  afterEach(() => database.close());

  /** Writes the row as an older trigger left it: source Markdown in the column and the index. */
  function insertLegacyRow(id: string, data: string, status = 'success') {
    database
      .prepare(
        `INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at)
         VALUES (?, 'session', 'assistant', ?, ?, 1, 1)`,
      )
      .run(id, data, status);
    const source = (JSON.parse(data) as { parts?: { text: string }[] }).parts?.[0]?.text;
    if (source) {
      database
        .prepare('UPDATE agent_session_message SET searchable_text = ? WHERE id = ?')
        .run(source, id);
    }
  }

  const textData = (text: string) =>
    JSON.stringify({ parts: [{ id: 'p', type: 'text', state: 'done', text }] });
  const readText = (id: string) =>
    (
      database
        .prepare('SELECT searchable_text AS text FROM agent_session_message WHERE id = ?')
        .get(id) as { text: string }
    ).text;
  const search = (pattern: string) =>
    (
      database
        .prepare(
          `SELECT m.id FROM agent_session_message m
           JOIN agent_session_message_fts fts ON m.fts_rowid = fts.rowid
           WHERE fts.searchable_text LIKE ? ORDER BY m.id`,
        )
        .all(`%${pattern}%`) as { id: string }[]
    ).map((row) => row.id);

  test('rewrites legacy Markdown as visible text and re-indexes it', () => {
    insertLegacyRow('formatted', textData('支持**多模态**输入'));
    insertLegacyRow('code', textData('Use `List<T>` here'));
    insertLegacyRow('plain', textData('nothing to strip'));
    insertLegacyRow('streaming', textData('still **streaming**'), 'streaming');
    insertLegacyRow('corrupt', '{"version":1,"parts":"[broken"}');
    expect(search('支持多模态')).toEqual([]);

    backfillSearchableText(sqlite);

    expect(readText('formatted')).toBe('支持多模态输入');
    expect(readText('code')).toBe('Use List<T> here');
    expect(readText('plain')).toBe('nothing to strip');
    expect(readText('streaming')).toBe('still **streaming**');
    expect(search('支持多模态')).toEqual(['formatted']);
    expect(search('**')).toEqual(['streaming']);
    // With rank 1, FTS5 also compares the index against the content table.
    expect(() =>
      database.exec(`INSERT INTO agent_session_message_fts(agent_session_message_fts, rank)
        VALUES ('integrity-check', 1)`),
    ).not.toThrow();

    // A repeated run recomputes from data, so visible code keeps its markup characters.
    backfillSearchableText(sqlite);
    expect(readText('code')).toBe('Use List<T> here');
    expect(search('List<T>')).toEqual(['code']);
  });
});
