import type { SQLiteDatabase } from 'expo-sqlite';

import { toSearchableText } from '@/backend/data/services/utils/searchSnippet';

import { AGENT_SESSION_MESSAGE_FTS_STATEMENTS } from './schemas';

export const customSqlStatements: string[] = [...AGENT_SESSION_MESSAGE_FTS_STATEMENTS];

const SEARCHABLE_TEXT_BACKFILL_BATCH_SIZE = 200;

/**
 * Rewrites settled rows whose `searchable_text` may still hold source Markdown
 * as visible plain text; the update trigger re-indexes each changed row. Text
 * without any Markdown marker is already plain, so only marked rows are read.
 * The value is recomputed from `data`, so running again changes nothing.
 */
export function backfillSearchableText(
  sqlite: Pick<SQLiteDatabase, 'execSync' | 'getAllSync' | 'runSync'>,
): void {
  const markerCondition = ['*', '[', '<', '#', '`', '~', '\r']
    .map(() => 'instr(searchable_text, ?) > 0')
    .join(' OR ');
  sqlite.execSync('BEGIN IMMEDIATE');
  try {
    let afterRowid = 0;
    for (;;) {
      const rows = sqlite.getAllSync<{ data: string; rowid: number; searchableText: string }>(
        `SELECT rowid, data, searchable_text AS searchableText FROM agent_session_message
         WHERE rowid > ? AND status NOT IN ('pending', 'streaming') AND (${markerCondition})
         ORDER BY rowid LIMIT ?`,
        afterRowid,
        '*',
        '[',
        '<',
        '#',
        '`',
        '~',
        '\r',
        SEARCHABLE_TEXT_BACKFILL_BATCH_SIZE,
      );
      for (const row of rows) {
        const searchableText = readSearchableText(row.data);
        if (searchableText !== undefined && searchableText !== row.searchableText) {
          sqlite.runSync(
            'UPDATE agent_session_message SET searchable_text = ? WHERE rowid = ?',
            searchableText,
            row.rowid,
          );
        }
      }
      if (rows.length < SEARCHABLE_TEXT_BACKFILL_BATCH_SIZE) break;
      afterRowid = rows[rows.length - 1].rowid;
    }
    sqlite.execSync('COMMIT');
  } catch (error) {
    sqlite.execSync('ROLLBACK');
    throw error;
  }
}

/** Unreadable data keeps its current value instead of failing startup. */
function readSearchableText(data: string): string | undefined {
  try {
    const parts = (JSON.parse(data) as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return undefined;
    return toSearchableText(
      parts.filter(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          (part as { type?: unknown }).type === 'text' &&
          typeof (part as { text?: unknown }).text === 'string',
      ),
    );
  } catch {
    return undefined;
  }
}
