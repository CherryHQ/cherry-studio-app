import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { DbService } from '@/backend/data/db/DbService';
import { agentSessionMessageTable, agentSessionTable } from '@/backend/data/db/schemas';
import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import {
  toAgentMessageView,
  toAgentSessionView,
} from '@/backend/data/services/utils/agentSessionRows';
import {
  type AgentErrorView,
  type AgentMessageView,
  type AgentSessionView,
} from '@/shared/contracts/agent';

import type {
  AgentSessionStore,
  FinalizeAssistantMessageInput,
  ReserveSubmissionInput,
  ReserveSubmissionResult,
} from './AgentSessionStore';
import { interruptNonTerminalToolParts } from './mapping';

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

  async autoRenameSession(
    sessionId: string,
    expectedTitle: string,
    title: string,
  ): Promise<AgentSessionView | null> {
    return this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .update(agentSessionTable)
        .set({ title, titleIsManual: false })
        .where(
          and(
            eq(agentSessionTable.id, sessionId),
            eq(agentSessionTable.title, expectedTitle),
            eq(agentSessionTable.titleIsManual, false),
          ),
        )
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

  async reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult> {
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
          modelId: input.modelId,
          messageSnapshot: input.inferenceSnapshot,
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

  async getLatestContextCheckpoint(sessionId: string) {
    const [row] = await this.dbService
      .getDb()
      .select({
        assistantMessageId: agentSessionMessageTable.id,
        checkpointJson: sql<string>`${agentSessionMessageTable.contextCheckpoint}`,
      })
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.sessionId, sessionId),
          eq(agentSessionMessageTable.role, 'assistant'),
          eq(agentSessionMessageTable.status, 'success'),
          isNotNull(agentSessionMessageTable.contextCheckpoint),
        ),
      )
      .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id))
      .limit(1);
    if (!row) {
      return null;
    }

    let checkpoint: unknown = row.checkpointJson;
    try {
      checkpoint = JSON.parse(row.checkpointJson) as unknown;
    } catch {
      // Return the raw value so the Host can classify it and fall back to full history.
    }
    return { assistantMessageId: row.assistantMessageId, checkpoint };
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
          contextCheckpoint: input.status === 'success' ? input.contextCheckpoint : null,
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
      const rows = await tx
        .select()
        .from(agentSessionMessageTable)
        .where(inArray(agentSessionMessageTable.status, [...UNSETTLED_MESSAGE_STATUSES]));
      let assistantCount = 0;

      for (const row of rows) {
        const message = toAgentMessageView(row);
        await tx
          .update(agentSessionMessageTable)
          .set({
            status: 'interrupted',
            data: {
              version: 1,
              parts: interruptNonTerminalToolParts(message.parts, error.message),
            },
            ...(message.role === 'assistant' ? { error } : {}),
          })
          .where(eq(agentSessionMessageTable.id, message.id));
        if (message.role === 'assistant') {
          assistantCount += 1;
        }
      }

      return assistantCount;
    });
  }
}
