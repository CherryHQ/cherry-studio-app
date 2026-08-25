import { and, eq, inArray } from 'drizzle-orm';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { DbService, Database } from '@/backend/data/db/DbService';
import { agentSessionMessageTable, agentSessionTable } from '@/backend/data/db/schemas';
import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import {
  toAgentMessageView,
  toAgentSessionView,
} from '@/backend/data/services/utils/agentSessionRows';
import {
  type AgentErrorView,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentSessionView,
} from '@/shared/contracts/agent';

import type {
  AgentSessionStore,
  FinalizeAssistantMessageInput,
  ReserveSubmissionResult,
} from './AgentSessionStore';

const UNSETTLED_MESSAGE_STATUSES = ['pending', 'streaming'] as const;

/**
 * Durable SQLite adapter for {@link AgentSessionStore}
 * (docs/references/agent/agent-persistence.md).
 *
 * Multi-record operations run inside `DbService.withWriteTx()`. The
 * invariant-1 partial unique index turns a concurrent second reservation into
 * a constraint violation, which the Host's admission guard normally prevents
 * from ever reaching the database.
 */
@Injectable('AgentSessionStore')
@ServicePhase(Phase.PostReady)
@DependsOn(['DbService'])
@AppStatePolicy('not-applicable')
export class SqliteAgentSessionStore extends BaseService implements AgentSessionStore {
  constructor(private readonly dbService: DbService) {
    super();
  }

  async createSession(input: { agentId: string; title?: string }): Promise<AgentSessionView> {
    return this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .insert(agentSessionTable)
        .values({
          agentId: input.agentId,
          title: input.title ?? '',
          titleIsManual: input.title !== undefined,
        })
        .returning();
      return toAgentSessionView(row);
    });
  }

  async getSession(sessionId: string): Promise<AgentSessionView | null> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId))
      .limit(1);
    return row ? toAgentSessionView(row) : null;
  }

  async renameSession(sessionId: string, title: string): Promise<AgentSessionView | null> {
    return this.dbService.withWriteTx(async (tx) => {
      // Renames deliberately do not touch lastActivityAt.
      const [row] = await tx
        .update(agentSessionTable)
        .set({ title, titleIsManual: true })
        .where(eq(agentSessionTable.id, sessionId))
        .returning();
      return row ? toAgentSessionView(row) : null;
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.dbService.withWriteTx(async (tx) => {
      // Messages go with the session via the ON DELETE CASCADE foreign key.
      const deleted = await tx
        .delete(agentSessionTable)
        .where(eq(agentSessionTable.id, sessionId))
        .returning({ id: agentSessionTable.id });
      return deleted.length > 0;
    });
  }

  async reserveSubmission(input: {
    sessionId: string;
    userParts: AgentMessagePart[];
  }): Promise<ReserveSubmissionResult> {
    return this.dbService.withWriteTx(async (tx) => {
      const now = Date.now();
      const touched = await tx
        .update(agentSessionTable)
        .set({ lastActivityAt: now })
        .where(eq(agentSessionTable.id, input.sessionId))
        .returning({ id: agentSessionTable.id });
      if (touched.length === 0) {
        throw new Error(`Cannot reserve a submission for an unknown session: ${input.sessionId}`);
      }
      const turnId = createOrderedUuid();
      const [userRow] = await tx
        .insert(agentSessionMessageTable)
        .values({
          sessionId: input.sessionId,
          turnId,
          role: 'user',
          status: 'success',
          data: { version: 1, parts: input.userParts },
        })
        .returning();
      const [assistantRow] = await tx
        .insert(agentSessionMessageTable)
        .values({
          sessionId: input.sessionId,
          turnId,
          role: 'assistant',
          status: 'pending',
          data: { version: 1, parts: [] },
        })
        .returning();
      return {
        turnId,
        userMessage: toAgentMessageView(userRow),
        assistantMessage: toAgentMessageView(assistantRow),
      };
    });
  }

  async listMessages(sessionId: string): Promise<AgentMessageView[]> {
    const rows = await this.dbService
      .getDb()
      .select()
      .from(agentSessionMessageTable)
      .where(eq(agentSessionMessageTable.sessionId, sessionId))
      .orderBy(agentSessionMessageTable.createdAt, agentSessionMessageTable.id);
    return rows.map(toAgentMessageView);
  }

  async finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView> {
    return this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .update(agentSessionMessageTable)
        .set({
          status: input.status,
          data: { version: 1, parts: input.parts },
          usage: input.usage,
          error: input.error,
        })
        .where(eq(agentSessionMessageTable.id, input.assistantMessageId))
        .returning();
      if (!row) {
        throw new Error(`Cannot finalize an unknown message: ${input.assistantMessageId}`);
      }
      await tx
        .update(agentSessionTable)
        .set({ lastActivityAt: Date.now() })
        .where(eq(agentSessionTable.id, row.sessionId));
      return toAgentMessageView(row);
    });
  }

  async reconcileInterrupted(error: AgentErrorView): Promise<number> {
    return this.dbService.withWriteTx(async (tx) => {
      const reconciled = await this.markInterrupted(tx, 'assistant', error);
      // User/system rows settle at insert; this sweeps any row a future writer
      // leaves unsettled so reconciliation stays complete by construction.
      await this.markInterrupted(tx, null, null);
      return reconciled.length;
    });
  }

  private markInterrupted(
    tx: Database,
    role: 'assistant' | null,
    error: AgentErrorView | null,
  ): Promise<{ id: string }[]> {
    return tx
      .update(agentSessionMessageTable)
      .set({ status: 'interrupted', ...(error ? { error } : {}) })
      .where(
        and(
          inArray(agentSessionMessageTable.status, [...UNSETTLED_MESSAGE_STATUSES]),
          ...(role ? [eq(agentSessionMessageTable.role, role)] : []),
        ),
      )
      .returning({ id: agentSessionMessageTable.id });
  }
}
