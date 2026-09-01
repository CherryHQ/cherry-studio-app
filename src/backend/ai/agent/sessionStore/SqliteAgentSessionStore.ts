import { and, desc, eq, gt, inArray, isNotNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { Database, DbService } from '@/backend/data/db/DbService';
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
  ForkSessionInput,
  ForkSessionResult,
  ReserveInitialSubmissionInput,
  ReserveInitialSubmissionResult,
  ReserveSubmissionInput,
  ReserveSubmissionResult,
} from './AgentSessionStore';
import { interruptNonTerminalToolParts } from './messageSettlement';

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

  /** @internal Test and legacy-state fixture; product creation uses reserveInitialSubmission. */
  async createEmptySession(input: { agentId: string; title?: string }): Promise<AgentSessionView> {
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

  async reserveInitialSubmission(
    input: ReserveInitialSubmissionInput,
  ): Promise<ReserveInitialSubmissionResult> {
    return this.dbService.withWriteTx(async (tx) => {
      const [sessionRow] = await tx
        .insert(agentSessionTable)
        .values({
          agentId: input.agentId,
          executionTarget: input.executionTarget,
          lastActivityAt: Date.now(),
        })
        .returning();
      const reserved = await insertSubmission(tx, {
        sessionId: sessionRow.id,
        userParts: input.userParts,
        modelId: input.modelId,
        inferenceSnapshot: input.inferenceSnapshot,
      });
      return { ...reserved, session: toAgentSessionView(sessionRow) };
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
      return insertSubmission(tx, input);
    });
  }

  async forkSession(input: ForkSessionInput): Promise<ForkSessionResult> {
    return this.dbService.withWriteTx(async (tx) => {
      const [source] = await tx
        .select()
        .from(agentSessionTable)
        .where(eq(agentSessionTable.id, input.sessionId))
        .limit(1);
      if (!source) {
        return { status: 'session-not-found' };
      }

      const [anchor] = await tx
        .select({
          createdAt: agentSessionMessageTable.createdAt,
          id: agentSessionMessageTable.id,
          status: agentSessionMessageTable.status,
        })
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.id, input.fromMessageId),
            eq(agentSessionMessageTable.sessionId, input.sessionId),
          ),
        )
        .limit(1);
      if (!anchor) {
        return { status: 'message-not-found' };
      }
      if ((UNSETTLED_MESSAGE_STATUSES as readonly string[]).includes(anchor.status)) {
        return { status: 'fork-point-unsettled' };
      }

      const [forked] = await tx
        .insert(agentSessionTable)
        .values({
          agentId: source.agentId,
          executionTarget: source.executionTarget,
          forkedFromSessionId: source.id,
          lastActivityAt: Date.now(),
          // Falls back to the source's name. Auto-naming will not rewrite
          // either form later, because neither is empty nor matches the
          // first-user-message title the naming policy expects to overwrite.
          title: input.title ?? source.title,
          titleIsManual: source.titleIsManual,
        })
        .returning();

      // Transcript order is `(createdAt, id)`, so the fork point is a keyset
      // bound, not an offset.
      const copied = await tx
        .select()
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, input.sessionId),
            // An unsettled assistant row would arrive as a placeholder that
            // nothing will ever settle: boot reconciliation only reaches rows
            // that were unsettled when the process died.
            notInArray(agentSessionMessageTable.status, [...UNSETTLED_MESSAGE_STATUSES]),
            or(
              lt(agentSessionMessageTable.createdAt, anchor.createdAt),
              and(
                eq(agentSessionMessageTable.createdAt, anchor.createdAt),
                lte(agentSessionMessageTable.id, anchor.id),
              ),
            ),
          ),
        )
        .orderBy(agentSessionMessageTable.createdAt, agentSessionMessageTable.id);

      const forkedTurnIds = new Map<string, string>();
      // Serial inserts, not one multi-row statement: the copy relies on the
      // generated UUID v7 ids staying monotonic in transcript order, and a
      // batched insert would also risk the bound-parameter ceiling on a long
      // transcript.
      for (const row of copied) {
        await tx.insert(agentSessionMessageTable).values({
          // Deliberate exception to the "never write createdAt" rule in
          // `_columnHelpers.ts`: the fork presents the same history, so its
          // rows keep the moment they were originally written. Ordering still
          // holds because createdAt is the major sort key and the reissued ids
          // break ties in the same direction as the source.
          createdAt: row.createdAt,
          data: row.data,
          error: row.error,
          messageSnapshot: row.messageSnapshot,
          modelId: row.modelId,
          role: row.role,
          sessionId: forked.id,
          status: row.status,
          // contextCheckpoint is deliberately dropped: it is a Runtime-private
          // artifact anchored to a turn id that this copy no longer carries, so
          // the fork's first execution replays full history instead.
          turnId: reissueTurnId(forkedTurnIds, row.turnId),
          usage: row.usage,
        });
      }

      return { session: toAgentSessionView(forked), status: 'forked' };
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

  async loadRuntimeTurnContext(sessionId: string, afterTurnId: string | null) {
    const db = this.dbService.getDb();
    const [anchor] =
      afterTurnId === null
        ? []
        : await db
            .select({
              createdAt: agentSessionMessageTable.createdAt,
              id: agentSessionMessageTable.id,
            })
            .from(agentSessionMessageTable)
            .where(
              and(
                eq(agentSessionMessageTable.sessionId, sessionId),
                eq(agentSessionMessageTable.turnId, afterTurnId),
              ),
            )
            .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id))
            .limit(1);
    const anchorFound = afterTurnId === null || anchor !== undefined;
    const historyCondition =
      anchorFound && anchor
        ? and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            or(
              gt(agentSessionMessageTable.createdAt, anchor.createdAt),
              and(
                eq(agentSessionMessageTable.createdAt, anchor.createdAt),
                gt(agentSessionMessageTable.id, anchor.id),
              ),
            ),
          )
        : eq(agentSessionMessageTable.sessionId, sessionId);

    const [historyRows, messageRows, turnRows, fileRows] = await Promise.all([
      db
        .select()
        .from(agentSessionMessageTable)
        .where(historyCondition)
        .orderBy(agentSessionMessageTable.createdAt, agentSessionMessageTable.id),
      db
        .select({ id: agentSessionMessageTable.id })
        .from(agentSessionMessageTable)
        .where(eq(agentSessionMessageTable.sessionId, sessionId))
        .limit(1),
      db
        .select({ turnId: agentSessionMessageTable.turnId })
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            isNotNull(agentSessionMessageTable.turnId),
          ),
        )
        .groupBy(agentSessionMessageTable.turnId),
      db.all<{ fileEntryId: string | null }>(sql`
        SELECT DISTINCT json_extract(part.value, '$.fileEntryId') AS "fileEntryId"
        FROM agent_session_message AS message,
             json_each(json_extract(message.data, '$.parts')) AS part
        WHERE message.session_id = ${sessionId}
          AND json_extract(part.value, '$.type') = 'file'
      `),
    ]);

    return {
      anchorFound,
      hasMessages: messageRows.length > 0,
      history: historyRows.map(toAgentMessageView),
      referencedFileEntryIds: fileRows
        .flatMap(({ fileEntryId }) => (typeof fileEntryId === 'string' ? [fileEntryId] : []))
        .sort(),
      sessionTurnIds: turnRows.flatMap(({ turnId }) => (turnId === null ? [] : [turnId])).sort(),
    };
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

/**
 * Reissues one source turn id per fork, keeping a submission's user/assistant
 * pair correlated while leaving no id shared with the source Session.
 */
function reissueTurnId(reissued: Map<string, string>, turnId: string | null): string | null {
  if (turnId === null) {
    return null;
  }

  const existing = reissued.get(turnId);
  if (existing !== undefined) {
    return existing;
  }

  const next = createOrderedUuid();
  reissued.set(turnId, next);
  return next;
}

async function insertSubmission(
  tx: Database,
  input: ReserveSubmissionInput,
): Promise<ReserveSubmissionResult> {
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
}
