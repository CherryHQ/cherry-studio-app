import { eq } from 'drizzle-orm';

import type { DiagnosticFeedbackContext } from '@/shared/contracts/diagnostics';

import type { DbService } from '../db/DbService';
import { agentTable } from '../db/schemas/agent';
import { agentSessionTable } from '../db/schemas/agentSession';

/** Bounded reads only: no message bodies, credentials, migrations or repair writes. */
export async function readDiagnosticDataState(
  database: Pick<DbService, 'getDb' | 'getSqlite'>,
  context: DiagnosticFeedbackContext | undefined,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const schema = await database
    .getSqlite()
    .getFirstAsync<{ schema_version: number }>('PRAGMA schema_version');
  if (!schema) throw new Error('Application database is unavailable');
  const db = database.getDb();
  // Access an application table even when this incident has no local Session.
  await db.select({ id: agentSessionTable.id }).from(agentSessionTable).limit(1);
  signal.throwIfAborted();
  if (!context?.sessionId || context.executionSource === 'desktop') return { missingCount: 0 };
  const [session] = await db
    .select({ agentId: agentSessionTable.agentId })
    .from(agentSessionTable)
    .where(eq(agentSessionTable.id, context.sessionId))
    .limit(1);
  signal.throwIfAborted();
  if (!session) return { missingCount: 1 };
  const [agent] = await db
    .select({ id: agentTable.id })
    .from(agentTable)
    .where(eq(agentTable.id, session.agentId))
    .limit(1);
  signal.throwIfAborted();
  return { missingCount: agent ? 0 : 1 };
}
