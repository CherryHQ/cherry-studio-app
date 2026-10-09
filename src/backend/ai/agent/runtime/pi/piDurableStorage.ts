import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, type Cursor } from '@earendil-works/pi-durable';
import {
  applySqliteMigrations,
  CURRENT_SQLITE_SCHEMA_VERSION,
  SQLITE_MIGRATIONS,
  SqliteStorage,
} from '@earendil-works/pi-durable/storage/sqlite';

import type { RuntimeSqlDatabase, RuntimeStorageDescription } from '../durableTypes';
import { detachedJson, PiConfigurationSchema, readPiSubmission } from './piDurableProjection';
import { PiDurableRuntime } from './PiDurableRuntime';

export const PI_STORAGE_SCHEMA = {
  runtimeVersion: '1.1.0',
  schemaVersion: CURRENT_SQLITE_SCHEMA_VERSION,
  migrations: JSON.stringify(SQLITE_MIGRATIONS),
} as const;

/** Validate an idle paired snapshot without registry effects, credentials, or historical task execution. */
export async function validatePiStorage(
  database: RuntimeSqlDatabase,
  reference: RuntimeSqlDatabase,
  validateInputMetadata?: (
    metadata: RuntimeStorageDescription['sessions'][number]['metadata'],
  ) => void,
) {
  let runtime: PiDurableRuntime | undefined;
  try {
    await applySqliteMigrations(reference);
    const expected = await schema(reference);
    const version = await database.get<{ version: number }>(
      'SELECT version FROM durable_schema WHERE singleton = 1',
    );
    if (version?.version !== CURRENT_SQLITE_SCHEMA_VERSION || (await schema(database)) !== expected)
      throw new Error('The Pi database does not match the bundled storage schema.');
    const integrity = await database.get<{ integrity_check: string }>('PRAGMA integrity_check');
    if (integrity?.integrity_check !== 'ok')
      throw new Error('The Pi database failed its integrity check.');
    const storage = await SqliteStorage.open(database);
    runtime = await PiDurableRuntime.open(storage, {
      registry: createRegistry(),
      models: createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
      }),
    });
    const inspection = await runtime.inspect();
    if (inspection.tasks.length || inspection.submissions.length)
      throw new Error('A backup cannot contain unfinished Pi execution.');
    const sessions: RuntimeStorageDescription['sessions'][number][] = [];
    for (const { sessionId, binding } of await runtime.sessions()) {
      if (binding.conversationId === null || !(await runtime.conversation(sessionId)))
        throw new Error('The Pi session binding has no conversation.');
      const metadata = detachedJson(binding.metadata);
      PiConfigurationSchema.parse(await runtime.configuration(sessionId));
      sessions.push({
        sessionId,
        metadata,
        committed: await runtime.hasInputs(sessionId),
        legacy: binding.legacy
          ? {
              sourceSessionId: binding.legacy.sourceSessionId,
              throughMessageId: binding.legacy.throughMessageId,
            }
          : null,
        fileEntryIds: await runtime.resourceFileEntryIds(sessionId),
      });
    }
    let messages = 0;
    let cursor: Cursor | undefined;
    do {
      const page = await storage.scanSubmissions({}, 256, cursor, BACKGROUND_CONTEXT);
      for (const record of page.items) {
        if (record.type !== 'input') continue;
        const input = readPiSubmission(await runtime.submissionMetadata(record));
        if (record.requestId !== input.requestId)
          throw new Error('The Pi submission identity is inconsistent.');
        validateInputMetadata?.(input.metadata);
        if (record.entry !== undefined) messages += 2;
      }
      cursor = page.next;
    } while (cursor);
    return { messages, sessions };
  } finally {
    try {
      if (runtime) await runtime.close();
      else await database.close();
    } finally {
      await reference.close();
    }
  }
}

async function schema(database: RuntimeSqlDatabase) {
  const rows = await database.all<{ type: string; name: string; sql: string }>(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' ORDER BY type, name",
  );
  return JSON.stringify(rows.map((row) => ({ ...row, sql: row.sql.replace(/\s+/g, ' ').trim() })));
}
