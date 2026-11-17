import {
  type MemoryAuthority,
  type MemoryScope,
  memoryScopeKey,
  MemoryError,
} from '@cherrystudio/memory';
import { eq } from 'drizzle-orm';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type { DbService } from '@/backend/data/db/DbService';
import { appStateTable } from '@/backend/data/db/schemas';
import { MemoryContextChangedError } from '@/shared/contracts/memory';
import { AgentIdSchema } from '@/shared/data/types/agent';

export type MemoryCaller = {
  agentId: string;
  sessionId: string;
  /** The Host derives this from stored branch context, never from a tool argument. */
  hasHistory?: boolean;
  userMessageId?: string;
  turnId?: string;
};
type OwnerRow = { updated_at: number; shared_memory_enabled: number; runtime_revision: number };

export function createMemoryAuthority(
  db: DbService,
  caller: MemoryCaller,
  scope: MemoryScope,
  signal?: AbortSignal,
  protectionOnly = false,
): MemoryAuthority {
  AgentIdSchema.parse(caller.agentId);
  if (scope.kind === 'private' && scope.agentId !== caller.agentId)
    throw new MemoryError('invalid-path', 'Another Agent owns this private memory');
  const owner = (): OwnerRow => {
    signal?.throwIfAborted();
    const row = db
      .getSqlite()
      .getFirstSync<OwnerRow>(
        'SELECT a.updated_at, a.shared_memory_enabled, s.runtime_revision FROM agent a JOIN agent_session s ON s.agent_id = a.id WHERE a.id = ? AND s.id = ? AND a.deleted_at IS NULL',
        caller.agentId,
        caller.sessionId,
      );
    if (!row || (scope.kind === 'shared' && !row.shared_memory_enabled && !protectionOnly))
      throw new MemoryError('invalid-receipt', 'Memory access is no longer authorized');
    return row;
  };
  const initial = owner();
  const assertAuthorized = (): undefined => {
    const latest = owner();
    if (
      latest.updated_at !== initial.updated_at ||
      latest.runtime_revision !== initial.runtime_revision
    )
      throw new MemoryError(
        'invalid-receipt',
        'The memory caller changed; begin a fresh operation',
      );
    return undefined;
  };
  return {
    scope,
    assertAuthorized,
    assertWritable() {
      assertAuthorized();
      storageMutationGate.assertWritable();
    },
    async assertHistory(protection) {
      assertAuthorized();
      const key = memoryRuntimeKey(caller.sessionId, scope);
      const validate = (state: unknown) => {
        if (
          !state ||
          typeof state !== 'object' ||
          !('version' in state) ||
          state.version !== 1 ||
          !('protection' in state)
        )
          throw new MemoryError('conflict', 'Invalid conversation memory state');
        if (state.protection !== protection) throw new MemoryContextChangedError();
      };
      const [existing] = await db
        .getDb()
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, key))
        .limit(1);
      if (existing) {
        validate(existing.value);
        assertAuthorized();
        return;
      }
      await db.withWriteTx(async (tx) => {
        assertAuthorized();
        const [row] = await tx
          .select()
          .from(appStateTable)
          .where(eq(appStateTable.key, key))
          .limit(1);
        if (row) {
          validate(row.value);
          return;
        }
        const hasHistory =
          caller.hasHistory ??
          Boolean(
            db
              .getSqlite()
              .getFirstSync(
                'SELECT id FROM agent_session_message WHERE session_id = ? AND id != ? LIMIT 1',
                caller.sessionId,
                caller.userMessageId ?? '',
              ),
          );
        if (protection && hasHistory) throw new MemoryContextChangedError();
        storageMutationGate.assertWritable();
        await tx.insert(appStateTable).values({
          key,
          value: { version: 1, protection },
          description: 'Memory protection boundary for a conversation',
        });
      });
      assertAuthorized();
    },
  };
}

export function memoryRuntimeKey(sessionId: string, scope: MemoryScope): string {
  return 'memory.runtime:' + JSON.stringify([sessionId, memoryScopeKey(scope)]);
}
