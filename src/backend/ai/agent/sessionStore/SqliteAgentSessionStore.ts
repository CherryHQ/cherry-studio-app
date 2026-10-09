import { and, desc, eq, inArray, isNotNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { readSqliteRows } from '@/backend/data/db/readSqliteRows';
import { agentSessionMessageTable, agentSessionTable } from '@/backend/data/db/schemas';
import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import {
  agentMessageViewColumns,
  agentMessageViewSqlColumns,
  fromAgentMessageViewSqlRow,
  toAgentMessageView,
  toAgentSessionView,
} from '@/backend/data/services/utils/agentSessionRows';
import { toSearchableText } from '@/backend/data/services/utils/searchSnippet';
import {
  type AgentErrorView,
  type AgentMessageView,
  type AgentSessionView,
} from '@/shared/contracts/agent';
import type { MessageRuntimeTiming } from '@/shared/data/types/message';

import type {
  AgentSessionProjection,
  AgentSessionStore,
  DeleteTurnInput,
  DeleteTurnResult,
  FinalizeAssistantMessageInput,
  ForkedMessageCopy,
  ForkSessionInput,
  ForkSessionResult,
  ReserveInitialSubmissionInput,
  ReserveInitialSubmissionResult,
  ReserveRetryInput,
  ReserveSubmissionInput,
  ReserveSubmissionResult,
  UpdateStreamingAssistantMessageInput,
} from './AgentSessionStore';
import { toDurableIndexMessage } from './AgentSessionStore';
import {
  interruptNonTerminalToolParts,
  settleInterruptedAssistantParts,
} from './messageSettlement';

const UNSETTLED_MESSAGE_STATUSES = ['pending', 'streaming'] as const;
// 50 rows bind fewer parameters than SQLite's historical 999-variable ceiling.
const FORK_INSERT_CHUNK_SIZE = 50;

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

  async archiveSession(sessionId: string): Promise<boolean> {
    const rows = await this.dbService.withWriteTx(async (tx) =>
      tx
        .update(agentSessionTable)
        .set({ archivedAt: sql`COALESCE(${agentSessionTable.archivedAt}, ${Date.now()})` })
        .where(eq(agentSessionTable.id, sessionId))
        .returning({ id: agentSessionTable.id }),
    );
    if (rows.length) publishDataApiChanges(['/agent-sessions', `/agent-sessions/${sessionId}`]);
    return rows.length > 0;
  }

  async isSessionArchived(sessionId: string): Promise<boolean> {
    const [row] = await this.dbService
      .getDb()
      .select({ archivedAt: agentSessionTable.archivedAt })
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId))
      .limit(1);
    return row?.archivedAt !== undefined && row.archivedAt !== null;
  }

  async indexDurableMessages(messages: readonly AgentMessageView[]): Promise<void> {
    if (!messages.length) return;
    const rows = messages.map((message) => {
      const view = toDurableIndexMessage(message);
      return {
        id: view.id,
        sessionId: view.sessionId,
        turnId: view.turnId,
        role: view.role,
        data: { version: 1 as const, parts: view.parts },
        status: view.status,
        stats: view.stats,
        searchableText: toSearchableText(view.parts),
        createdAt: Date.parse(view.createdAt),
        updatedAt: Date.parse(view.updatedAt),
      };
    });
    await this.dbService.withWriteTx(async (tx) => {
      for (const row of rows)
        // Usage and stats are written by the analytics ledger; an upsert keeps them.
        await tx
          .insert(agentSessionMessageTable)
          .values(row)
          .onConflictDoUpdate({
            target: agentSessionMessageTable.id,
            set: {
              data: row.data,
              status: row.status,
              ...(row.stats?.runtimeTiming
                ? {
                    stats: sql`json_set(
                      COALESCE(${agentSessionMessageTable.stats}, '{}'),
                      '$.runtimeTiming',
                      json(${JSON.stringify(row.stats.runtimeTiming)})
                    )`,
                  }
                : {}),
              searchableText: row.searchableText,
              updatedAt: row.updatedAt,
            },
            setWhere: eq(agentSessionMessageTable.sessionId, row.sessionId),
          });
    });
  }

  async getDurableRuntimeTimings(messageIds: readonly string[]) {
    const timings = new Map<string, MessageRuntimeTiming>();
    if (!messageIds.length) return timings;
    const rows = await this.dbService
      .getDb()
      .select({ id: agentSessionMessageTable.id, stats: agentSessionMessageTable.stats })
      .from(agentSessionMessageTable)
      .where(inArray(agentSessionMessageTable.id, [...messageIds]));
    for (const row of rows)
      if (row.stats?.runtimeTiming) timings.set(row.id, row.stats.runtimeTiming);
    return timings;
  }

  async unindexDurableMessages(sessionId: string, messageIds: readonly string[]): Promise<void> {
    if (!messageIds.length) return;
    await this.dbService.withWriteTx((tx) =>
      tx
        .delete(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            inArray(agentSessionMessageTable.id, [...messageIds]),
          ),
        ),
    );
  }

  async projectSession(input: AgentSessionProjection): Promise<AgentSessionView> {
    let created = false;
    const session = await this.dbService.withWriteTx(async (tx) => {
      const [inserted] = await tx
        .insert(agentSessionTable)
        .values({
          ...input,
          updatedAt: input.createdAt,
        })
        .onConflictDoNothing({ target: agentSessionTable.id })
        .returning();
      created = inserted !== undefined;
      const row =
        inserted ??
        (
          await tx
            .select()
            .from(agentSessionTable)
            .where(eq(agentSessionTable.id, input.id))
            .limit(1)
        )[0];
      if (
        !row ||
        row.agentId !== input.agentId ||
        row.executionTarget.kind !== input.executionTarget.kind
      )
        throw new Error('A durable session identity belongs to a different business owner.');
      return toAgentSessionView(row);
    });
    if (created) publishDataApiChanges(['/agent-sessions', `/agent-sessions/${input.id}`]);
    return session;
  }

  async touchSession(sessionId: string, activityAt: number): Promise<void> {
    if (!Number.isFinite(activityAt)) throw new Error('Invalid session activity timestamp.');
    const changed = await this.dbService.withWriteTx(async (tx) => {
      return tx
        .update(agentSessionTable)
        .set({ lastActivityAt: activityAt })
        .where(
          and(
            eq(agentSessionTable.id, sessionId),
            lt(agentSessionTable.lastActivityAt, activityAt),
          ),
        )
        .returning({ id: agentSessionTable.id });
    });
    if (changed.length) publishDataApiChanges(['/agent-sessions', `/agent-sessions/${sessionId}`]);
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
    const session = await this.dbService.withWriteTx(async (tx) => {
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
    if (session) {
      publishDataApiChanges(['/agent-sessions', `/agent-sessions/${sessionId}`]);
    }
    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.dbService.withWriteTx(async (tx) => {
      // Advance each surviving fork's row timestamp through Drizzle before the
      // FK's ON DELETE SET NULL fallback can clear the lineage invisibly.
      await tx
        .update(agentSessionTable)
        .set({ forkBoundaryMessageId: null, forkedFromSessionId: null })
        .where(eq(agentSessionTable.forkedFromSessionId, sessionId));
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
          id: input.sessionId,
          agentId: input.agentId,
          executionTarget: input.executionTarget,
        })
        .returning();
      const { reservedAt, ...reserved } = await insertSubmission(tx, {
        sessionId: sessionRow.id,
        userMessageId: input.userMessageId,
        assistantMessageId: input.assistantMessageId,
        userParts: input.userParts,
        modelId: input.modelId,
        inferenceSnapshot: input.inferenceSnapshot,
      });
      const [activeSessionRow] = await tx
        .update(agentSessionTable)
        .set({ lastActivityAt: reservedAt })
        .where(eq(agentSessionTable.id, sessionRow.id))
        .returning();
      return { ...reserved, session: toAgentSessionView(activeSessionRow) };
    });
  }

  async reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult> {
    return this.dbService.withWriteTx(async (tx) => {
      const [session] = await tx
        .select({ id: agentSessionTable.id })
        .from(agentSessionTable)
        .where(eq(agentSessionTable.id, input.sessionId))
        .limit(1);
      if (!session) {
        throw new Error(`Cannot reserve a submission for an unknown session: ${input.sessionId}`);
      }
      const { reservedAt, ...reserved } = await insertSubmission(tx, input);
      await tx
        .update(agentSessionTable)
        .set({ lastActivityAt: sql`max(${agentSessionTable.lastActivityAt}, ${reservedAt})` })
        .where(eq(agentSessionTable.id, input.sessionId));
      return reserved;
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
          role: agentSessionMessageTable.role,
          stats: agentSessionMessageTable.stats,
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
          // A fork copies history but creates no conversation activity of its
          // own. Keep the last included message's original activity time.
          lastActivityAt:
            anchor.role === 'assistant'
              ? (anchor.stats?.runtimeTiming?.completedAt ?? anchor.createdAt)
              : anchor.createdAt,
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
        .select({
          createdAt: agentSessionMessageTable.createdAt,
          data: agentSessionMessageTable.data,
          error: agentSessionMessageTable.error,
          id: agentSessionMessageTable.id,
          messageSnapshot: agentSessionMessageTable.messageSnapshot,
          modelId: agentSessionMessageTable.modelId,
          role: agentSessionMessageTable.role,
          searchableText: agentSessionMessageTable.searchableText,
          stats: agentSessionMessageTable.stats,
          status: agentSessionMessageTable.status,
          turnId: agentSessionMessageTable.turnId,
          usage: agentSessionMessageTable.usage,
        })
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
      const messageCopies: ForkedMessageCopy[] = [];
      let forkBoundaryMessageId: string | undefined;
      // Ids are generated here in transcript order, so they stay monotonic
      // across the chunked multi-row inserts below.
      const copiedRows = copied.map((row) => {
        const copiedMessageId = createOrderedUuid();
        const copiedTurnId = reissueTurnId(forkedTurnIds, row.turnId);
        messageCopies.push({
          source: { id: row.id, turnId: row.turnId },
          target: { id: copiedMessageId, turnId: copiedTurnId },
        });
        if (row.id === anchor.id) {
          forkBoundaryMessageId = copiedMessageId;
        }
        return {
          // Deliberate exception to the "never write createdAt" rule in
          // `_columnHelpers.ts`: the fork presents the same history, so its
          // rows keep the moment they were originally written. Ordering still
          // holds because createdAt is the major sort key and the reissued ids
          // break ties in the same direction as the source.
          createdAt: row.createdAt,
          data: row.data,
          error: row.error,
          id: copiedMessageId,
          messageSnapshot: row.messageSnapshot,
          modelId: row.modelId,
          role: row.role,
          searchableText: row.searchableText,
          sessionId: forked.id,
          stats: row.stats,
          status: row.status,
          // contextCheckpoint is deliberately dropped: it is a Runtime-private
          // artifact anchored to a turn id that this copy no longer carries, so
          // the fork's first execution replays full history instead.
          turnId: copiedTurnId,
          usage: row.usage,
        };
      });
      for (let index = 0; index < copiedRows.length; index += FORK_INSERT_CHUNK_SIZE) {
        await tx
          .insert(agentSessionMessageTable)
          .values(copiedRows.slice(index, index + FORK_INSERT_CHUNK_SIZE));
      }

      if (!forkBoundaryMessageId) {
        throw new Error('Fork transcript is missing its settled boundary message.');
      }
      const [forkedWithBoundary] = await tx
        .update(agentSessionTable)
        .set({ forkBoundaryMessageId })
        .where(eq(agentSessionTable.id, forked.id))
        .returning();

      return { session: toAgentSessionView(forkedWithBoundary), status: 'forked', messageCopies };
    });
  }

  async deleteTurn(input: DeleteTurnInput): Promise<DeleteTurnResult> {
    const result = await this.dbService.withWriteTx(async (tx): Promise<DeleteTurnResult> => {
      const [session] = await tx
        .select({ id: agentSessionTable.id })
        .from(agentSessionTable)
        .where(eq(agentSessionTable.id, input.sessionId))
        .limit(1);
      if (!session) {
        return { status: 'session-not-found' };
      }

      const turnRows = await tx
        .select({
          createdAt: agentSessionMessageTable.createdAt,
          id: agentSessionMessageTable.id,
          status: agentSessionMessageTable.status,
        })
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, input.sessionId),
            eq(agentSessionMessageTable.turnId, input.turnId),
          ),
        )
        .orderBy(agentSessionMessageTable.createdAt, agentSessionMessageTable.id);
      if (turnRows.length === 0) {
        return { status: 'turn-not-found' };
      }
      if (
        turnRows.some((row) =>
          (UNSETTLED_MESSAGE_STATUSES as readonly string[]).includes(row.status),
        )
      ) {
        return { status: 'turn-unsettled' };
      }

      // Checkpoint summaries cover everything up to their anchor turn, and the
      // store cannot read inside the opaque payload. Any checkpoint whose
      // anchor does not sit strictly before this turn may therefore have
      // absorbed it, so it is dropped rather than replayed. An anchor that no
      // longer resolves fails the same test and is cleared with them.
      const [firstRow] = turnRows;
      await tx
        .update(agentSessionMessageTable)
        .set({ contextCheckpoint: null })
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, input.sessionId),
            isNotNull(agentSessionMessageTable.contextCheckpoint),
            sql`NOT EXISTS (
              SELECT 1 FROM agent_session_message AS anchor
              WHERE anchor.session_id = ${input.sessionId}
                AND anchor.turn_id = json_extract(${agentSessionMessageTable.contextCheckpoint}, '$.anchorTurnId')
                AND (anchor.created_at < ${firstRow.createdAt}
                  OR (anchor.created_at = ${firstRow.createdAt} AND anchor.id < ${firstRow.id})))`,
          ),
        );

      const deletedMessageIds = turnRows.map((row) => row.id);
      // The boundary column is application-owned, so the delete below would
      // otherwise leave this Session pointing at a row that no longer exists.
      await tx
        .update(agentSessionTable)
        .set({ forkBoundaryMessageId: null })
        .where(
          and(
            eq(agentSessionTable.id, input.sessionId),
            inArray(agentSessionTable.forkBoundaryMessageId, deletedMessageIds),
          ),
        );

      await tx
        .delete(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, input.sessionId),
            eq(agentSessionMessageTable.turnId, input.turnId),
          ),
        );

      // Deleting the newest turn must give the Session back its previous
      // activity time; list ordering is recency, and a deleted turn is no
      // longer activity. Deleting an older turn recomputes the same value.
      const [newest] = await tx
        .select({
          createdAt: agentSessionMessageTable.createdAt,
          role: agentSessionMessageTable.role,
          stats: agentSessionMessageTable.stats,
        })
        .from(agentSessionMessageTable)
        .where(eq(agentSessionMessageTable.sessionId, input.sessionId))
        .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id))
        .limit(1);
      if (newest) {
        await tx
          .update(agentSessionTable)
          .set({
            lastActivityAt:
              newest.role === 'assistant'
                ? (newest.stats?.runtimeTiming?.completedAt ?? newest.createdAt)
                : newest.createdAt,
          })
          .where(eq(agentSessionTable.id, input.sessionId));
      }

      return { deletedMessageIds, status: 'deleted' };
    });
    if (result.status === 'deleted') {
      publishDataApiChanges(['/agent-sessions', `/agent-sessions/${input.sessionId}`]);
    }
    return result;
  }

  async reserveRetry(input: ReserveRetryInput): Promise<ReserveSubmissionResult> {
    return this.dbService.withWriteTx(async (tx) => {
      // The two trailing rows, newest first: only the latest answer is replaceable.
      const [source, user] = await tx
        .select(agentMessageViewColumns)
        .from(agentSessionMessageTable)
        .where(eq(agentSessionMessageTable.sessionId, input.sessionId))
        .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id))
        .limit(2);
      if (
        !source ||
        source.id !== input.assistantMessageId ||
        source.role !== 'assistant' ||
        (UNSETTLED_MESSAGE_STATUSES as readonly string[]).includes(source.status) ||
        !user ||
        user.id !== input.userMessageId ||
        user.role !== 'user' ||
        !source.turnId ||
        user.turnId !== source.turnId
      ) {
        throw new Error('The retry source is not the settled latest answer of this session.');
      }
      const turnId = createOrderedUuid();
      const [userRow] = await tx
        .update(agentSessionMessageTable)
        .set({
          turnId,
          data: { version: 1, parts: input.userParts },
          searchableText: toSearchableText(input.userParts),
        })
        .where(eq(agentSessionMessageTable.id, user.id))
        .returning(agentMessageViewColumns);
      // Reissued so the replacement execution's own part ids cannot collide
      // with a retained one carried over from the previous attempt.
      const retainedParts = input.assistantParts.map((part, index) => ({
        ...part,
        id: `retained-${turnId}-${index}`,
      }));
      const values = {
        turnId,
        status: 'pending',
        data: { version: 1 as const, parts: retainedParts },
        searchableText: toSearchableText(retainedParts),
        error: null,
        // The only summary that could cover the replaced answer is its own:
        // it is the last message, so earlier checkpoints stay valid.
        contextCheckpoint: null,
        modelId: input.modelId,
        messageSnapshot: input.inferenceSnapshot,
        // Provider totals belong to the immutable invocation ledger. Only runtime timing resets.
        stats: source.stats
          ? { ...source.stats, runtimeTiming: undefined, contextTokens: undefined }
          : null,
      };
      const [assistantRow] = await tx
        .update(agentSessionMessageTable)
        .set(values)
        .where(eq(agentSessionMessageTable.id, source.id))
        .returning(agentMessageViewColumns);
      await tx
        .update(agentSessionTable)
        .set({ lastActivityAt: Date.now() })
        .where(eq(agentSessionTable.id, input.sessionId));
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
      .select(agentMessageViewColumns)
      .from(agentSessionMessageTable)
      .where(eq(agentSessionMessageTable.sessionId, sessionId))
      .orderBy(agentSessionMessageTable.createdAt, agentSessionMessageTable.id);
    return rows.map(toAgentMessageView);
  }

  /**
   * Both per-turn reads go through Expo's async reader: Drizzle's Expo driver
   * reads synchronously, and these scan every message of the Session.
   */
  async loadRuntimeTurnContext(sessionId: string, afterTurnId: string | null) {
    const sqlite = this.dbService.getSqlite();
    const [anchor] =
      afterTurnId === null
        ? []
        : await readSqliteRows<{ createdAt: number; id: string }>(
            sqlite,
            sql`
              SELECT created_at AS "createdAt", id FROM agent_session_message
              WHERE session_id = ${sessionId} AND turn_id = ${afterTurnId}
              ORDER BY created_at DESC, id DESC
              LIMIT 1
            `,
          );
    const anchorFound = afterTurnId === null || anchor !== undefined;
    const historyRows = await readSqliteRows<Parameters<typeof fromAgentMessageViewSqlRow>[0]>(
      sqlite,
      sql`
        SELECT ${agentMessageViewSqlColumns} FROM agent_session_message AS message
        WHERE message.session_id = ${sessionId}
          ${
            anchor
              ? sql`AND (message.created_at > ${anchor.createdAt}
                  OR (message.created_at = ${anchor.createdAt} AND message.id > ${anchor.id}))`
              : sql``
          }
        ORDER BY message.created_at, message.id
      `,
    );
    const messageRows = await readSqliteRows<{ id: string }>(
      sqlite,
      sql`SELECT id FROM agent_session_message WHERE session_id = ${sessionId} LIMIT 1`,
    );
    const turnRows = await readSqliteRows<{ turnId: string }>(
      sqlite,
      sql`
        SELECT DISTINCT turn_id AS "turnId" FROM agent_session_message
        WHERE session_id = ${sessionId} AND turn_id IS NOT NULL
      `,
    );
    const fileRows = await readSqliteRows<{ fileEntryId: unknown }>(
      sqlite,
      sql`
        SELECT DISTINCT json_extract(part.value, '$.fileEntryId') AS "fileEntryId"
        FROM agent_session_message AS message,
             json_each(json_extract(message.data, '$.parts')) AS part
        WHERE message.session_id = ${sessionId}
          AND json_extract(part.value, '$.type') = 'file'
      `,
    );

    return {
      anchorFound,
      hasMessages: messageRows.length > 0,
      history: historyRows.map((row) => toAgentMessageView(fromAgentMessageViewSqlRow(row))),
      referencedFileEntryIds: fileRows
        .flatMap(({ fileEntryId }) => (typeof fileEntryId === 'string' ? [fileEntryId] : []))
        .sort(),
      sessionTurnIds: turnRows.map(({ turnId }) => turnId).sort(),
    };
  }

  async getLatestContextCheckpoint(sessionId: string, excludeAssistantMessageId?: string) {
    const [row] = await readSqliteRows<{ assistantMessageId: string; checkpointJson: string }>(
      this.dbService.getSqlite(),
      sql`
        SELECT id AS "assistantMessageId", context_checkpoint AS "checkpointJson"
        FROM agent_session_message
        WHERE session_id = ${sessionId}
          AND role = 'assistant'
          AND status = 'success'
          AND context_checkpoint IS NOT NULL
          ${excludeAssistantMessageId ? sql`AND id != ${excludeAssistantMessageId}` : sql``}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
    );
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

  async updateStreamingAssistantMessage(
    input: UpdateStreamingAssistantMessageInput,
  ): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      // Guarded by status so a late streaming write can never reopen a row the
      // terminal write has already settled.
      await tx
        .update(agentSessionMessageTable)
        .set({ status: 'streaming', data: { version: 1, parts: input.parts } })
        .where(
          and(
            eq(agentSessionMessageTable.id, input.assistantMessageId),
            inArray(agentSessionMessageTable.status, [...UNSETTLED_MESSAGE_STATUSES]),
          ),
        );
    });
  }

  async finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView> {
    const message = await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select({
          sessionId: agentSessionMessageTable.sessionId,
          stats: agentSessionMessageTable.stats,
          usage: agentSessionMessageTable.usage,
        })
        .from(agentSessionMessageTable)
        .where(eq(agentSessionMessageTable.id, input.assistantMessageId))
        .limit(1);
      if (!existing) {
        throw new Error(`Cannot finalize an unknown message: ${input.assistantMessageId}`);
      }
      const [row] = await tx
        .update(agentSessionMessageTable)
        .set({
          status: input.status,
          data: { version: 1, parts: input.parts },
          searchableText: toSearchableText(input.parts),
          usage: existing.stats?.requestCount !== undefined ? existing.usage : input.usage,
          stats: { ...existing.stats, ...input.runtimeStats },
          error: input.error,
          contextCheckpoint: input.status === 'success' ? input.contextCheckpoint : null,
        })
        .where(eq(agentSessionMessageTable.id, input.assistantMessageId))
        .returning(agentMessageViewColumns);
      if (!row) {
        throw new Error(`Cannot finalize an unknown message: ${input.assistantMessageId}`);
      }
      await tx
        .update(agentSessionTable)
        .set({
          lastActivityAt: sql`max(
            ${agentSessionTable.lastActivityAt},
            ${input.runtimeStats.runtimeTiming.completedAt}
          )`,
        })
        .where(eq(agentSessionTable.id, existing.sessionId));
      return toAgentMessageView(row);
    });
    publishDataApiChanges(['/agent-sessions', `/agent-sessions/${message.sessionId}`]);
    return message;
  }

  async reconcileInterrupted(error: AgentErrorView): Promise<AgentMessageView[]> {
    return this.dbService.withWriteTx(async (tx) => {
      const rows = await tx
        .select(agentMessageViewColumns)
        .from(agentSessionMessageTable)
        .where(inArray(agentSessionMessageTable.status, [...UNSETTLED_MESSAGE_STATUSES]));
      const assistantIds: string[] = [];

      for (const row of rows) {
        const message = toAgentMessageView(row);
        const interruptedParts =
          message.role === 'assistant'
            ? settleInterruptedAssistantParts(
                message.parts,
                error,
                `error-${message.turnId ?? message.id}`,
              )
            : interruptNonTerminalToolParts(message.parts, error.message);
        await tx
          .update(agentSessionMessageTable)
          .set({
            status: 'interrupted',
            data: {
              version: 1,
              parts: interruptedParts,
            },
            searchableText: toSearchableText(interruptedParts),
            ...(message.role === 'assistant' ? { error } : {}),
          })
          .where(eq(agentSessionMessageTable.id, message.id));
        if (message.role === 'assistant') {
          assistantIds.push(message.id);
        }
      }

      if (assistantIds.length === 0) {
        return [];
      }
      const reconciledRows = await tx
        .select(agentMessageViewColumns)
        .from(agentSessionMessageTable)
        .where(inArray(agentSessionMessageTable.id, assistantIds))
        .orderBy(agentSessionMessageTable.createdAt, agentSessionMessageTable.id);
      return reconciledRows.map(toAgentMessageView);
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
): Promise<ReserveSubmissionResult & { reservedAt: number }> {
  const turnId = createOrderedUuid();
  const [userRow] = await tx
    .insert(agentSessionMessageTable)
    .values({
      id: input.userMessageId,
      sessionId: input.sessionId,
      turnId,
      role: 'user',
      status: 'success',
      data: { version: 1, parts: input.userParts },
      searchableText: toSearchableText(input.userParts),
    })
    .returning(agentMessageViewColumns);
  const [assistantRow] = await tx
    .insert(agentSessionMessageTable)
    .values({
      id: input.assistantMessageId,
      sessionId: input.sessionId,
      turnId,
      role: 'assistant',
      status: 'pending',
      data: { version: 1, parts: [] },
      modelId: input.modelId,
      messageSnapshot: input.inferenceSnapshot,
    })
    .returning(agentMessageViewColumns);
  return {
    reservedAt: assistantRow.createdAt,
    turnId,
    userMessage: toAgentMessageView(userRow),
    assistantMessage: toAgentMessageView(assistantRow),
  };
}
