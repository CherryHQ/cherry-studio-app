import { agentProjectionSchema, type AgentProjection } from '@cherrystudio/remote-protocol/agent';
import { and, eq } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { remoteSessionProjectionTable as table } from '@/backend/data/db/schemas';

export interface SessionProjectionStore {
  read(
    connectionId: string,
    scopeId: string,
    sessionId: string,
  ): Promise<AgentProjection | undefined>;
  write(
    connectionId: string,
    scopeId: string,
    projection: AgentProjection,
    signal: AbortSignal,
  ): Promise<void>;
}

export class RemoteSessionProjectionStore implements SessionProjectionStore {
  constructor(private readonly db: DbService) {}
  async read(connectionId: string, scopeId: string, sessionId: string) {
    const [row] = await this.db
      .getDb()
      .select()
      .from(table)
      .where(
        and(
          eq(table.connectionId, connectionId),
          eq(table.scopeId, scopeId),
          eq(table.sessionId, sessionId),
        ),
      )
      .limit(1);
    if (!row) return undefined;
    const parsed = agentProjectionSchema.safeParse(row.projection);
    return parsed.success &&
      parsed.data.cursor.sessionId === sessionId &&
      parsed.data.cursor.streamEpoch === row.streamEpoch &&
      parsed.data.cursor.seq === row.seq
      ? parsed.data
      : undefined;
  }
  async write(
    connectionId: string,
    scopeId: string,
    projection: AgentProjection,
    signal: AbortSignal,
  ) {
    const values = {
      connectionId,
      scopeId,
      sessionId: projection.cursor.sessionId,
      streamEpoch: projection.cursor.streamEpoch,
      seq: projection.cursor.seq,
      projection,
      updatedAt: Date.now(),
    };
    await this.db.withWriteTx(async (tx) => {
      signal.throwIfAborted();
      await tx
        .insert(table)
        .values(values)
        .onConflictDoUpdate({
          target: [table.connectionId, table.scopeId, table.sessionId],
          set: values,
        });
      signal.throwIfAborted();
    });
  }
  async removeConnection(connectionId: string) {
    await this.db.withWriteTx(async (tx) => {
      await tx.delete(table).where(eq(table.connectionId, connectionId));
    });
  }
}
