import { and, asc, desc, eq, gt, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import type { DbService } from '@/backend/data/db/DbService';
import { agentTable } from '@/backend/data/db/schemas/agent';
import { agentSessionTable } from '@/backend/data/db/schemas/agentSession';
import { agentSessionMessageTable } from '@/backend/data/db/schemas/agentSessionMessage';
import { agentWorkspaceTable } from '@/backend/data/db/schemas/agentWorkspace';
import { pinTable } from '@/backend/data/db/schemas/pin';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type { OrderRequest } from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import type {
  AgentSessionEntity,
  CreateAgentSessionDto,
  DeleteAgentSessionsResult,
  ListAgentSessionsQuery,
  UpdateAgentSessionDto,
} from '@cherrystudio/universal/data/api/schemas/agentSessions';
import {
  AGENT_WORKSPACE_TYPE,
  type AgentSessionWorkspaceSource,
} from '@cherrystudio/universal/data/api/schemas/agentWorkspaces';
import type { CursorPaginationResponse } from '@cherrystudio/universal/data/api/types';

import type { PinService } from './PinService';
import { type AgentWorkspaceService, rowToAgentWorkspace } from './AgentWorkspaceService';
import { applyMoves, insertWithOrderKey } from './utils/orderKey';
import { nullsToUndefined, timestampToISO } from './utils/rowMappers';

type DbOrTx = any;
type SessionRow = typeof agentSessionTable.$inferSelect;
type JoinedRow = {
  session: SessionRow;
  workspace: typeof agentWorkspaceTable.$inferSelect;
};
type SessionCursor = { id: string; key: string; section: 'entity' | 'pin' };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function rowToSession(row: JoinedRow): AgentSessionEntity {
  return {
    ...nullsToUndefined(row.session),
    agentId: row.session.agentId,
    createdAt: timestampToISO(row.session.createdAt),
    updatedAt: timestampToISO(row.session.updatedAt),
    workspace: rowToAgentWorkspace(row.workspace),
  };
}

function encodeCursor(cursor: SessionCursor): string {
  return `${cursor.section}:${encodeURIComponent(cursor.key)}:${cursor.id}`;
}

function decodeCursor(value?: string): SessionCursor {
  if (!value) return { id: '', key: '', section: 'pin' };
  const [section, rawKey, ...idParts] = value.split(':');
  if ((section !== 'pin' && section !== 'entity') || rawKey === undefined) {
    return { id: '', key: '', section: 'pin' };
  }
  try {
    return { id: idParts.join(':'), key: decodeURIComponent(rawKey), section };
  } catch {
    return { id: '', key: '', section: 'pin' };
  }
}

export class AgentSessionService {
  constructor(
    private readonly dbService: DbService,
    private readonly workspaceService: AgentWorkspaceService,
    private readonly pinService: PinService,
  ) {}

  private get db() {
    return this.dbService.getDb();
  }

  private async hydrateSessions(tx: DbOrTx, sessions: SessionRow[]): Promise<JoinedRow[]> {
    if (sessions.length === 0) return [];
    const workspaceIds = [...new Set(sessions.map(({ workspaceId }) => workspaceId))];
    const workspaces: Array<typeof agentWorkspaceTable.$inferSelect> = await tx
      .select()
      .from(agentWorkspaceTable)
      .where(inArray(agentWorkspaceTable.id, workspaceIds));
    const workspaceById = new Map<string, typeof agentWorkspaceTable.$inferSelect>(
      workspaces.map((workspace) => [workspace.id, workspace]),
    );
    return sessions.map((session) => {
      const workspace = workspaceById.get(session.workspaceId);
      if (!workspace) throw DataApiErrorFactory.notFound('Workspace', session.workspaceId);
      return { session, workspace };
    });
  }

  private async joinedById(tx: DbOrTx, id: string): Promise<JoinedRow> {
    const [session] = await tx
      .select()
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, id))
      .limit(1);
    if (!session) throw DataApiErrorFactory.notFound('Session', id);
    const [row] = await this.hydrateSessions(tx, [session]);
    return row;
  }

  async getById(id: string): Promise<AgentSessionEntity> {
    return rowToSession(await this.joinedById(this.db, id));
  }

  async getLatestUpdated(): Promise<AgentSessionEntity | null> {
    const [session] = await this.db
      .select()
      .from(agentSessionTable)
      .orderBy(desc(agentSessionTable.updatedAt), asc(agentSessionTable.id))
      .limit(1);
    if (!session) return null;
    const [row] = await this.hydrateSessions(this.db, [session]);
    return rowToSession(row);
  }

  async listByCursor(
    query: ListAgentSessionsQuery = {},
  ): Promise<CursorPaginationResponse<AgentSessionEntity>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor(query.cursor);
    const agentFilter = query.agentId ? eq(agentSessionTable.agentId, query.agentId) : undefined;
    const items: { pinKey?: string; session: AgentSessionEntity }[] = [];

    if (cursor.section === 'pin') {
      const pinAfter = cursor.key
        ? or(
            gt(pinTable.orderKey, cursor.key),
            and(eq(pinTable.orderKey, cursor.key), gt(agentSessionTable.id, cursor.id)),
          )
        : undefined;
      const rows = await this.db
        .select({
          pinKey: sql<string>`${pinTable.orderKey}`.as('pin_order_key'),
          sessionId: sql<string>`${agentSessionTable.id}`.as('pinned_session_id'),
        })
        .from(agentSessionTable)
        .innerJoin(
          pinTable,
          and(eq(pinTable.entityType, 'session'), eq(pinTable.entityId, agentSessionTable.id)),
        )
        .where(and(agentFilter, pinAfter))
        .orderBy(asc(pinTable.orderKey), asc(agentSessionTable.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const pageSessionIds = page.map(({ sessionId }) => sessionId);
      const pageSessions = pageSessionIds.length
        ? await this.db
            .select()
            .from(agentSessionTable)
            .where(inArray(agentSessionTable.id, pageSessionIds))
        : [];
      const sessionById = new Map(pageSessions.map((session) => [session.id, session]));
      const hydrated = await this.hydrateSessions(
        this.db,
        page.map(({ sessionId }) => {
          const session = sessionById.get(sessionId);
          if (!session) throw DataApiErrorFactory.notFound('Session', sessionId);
          return session;
        }),
      );
      for (const [index, row] of hydrated.entries()) {
        items.push({ pinKey: page[index]?.pinKey, session: rowToSession(row) });
      }
      if (hasMore) {
        const last = items.at(-1);
        return {
          items: items.map(({ session }) => session),
          nextCursor: encodeCursor({
            id: last?.session.id ?? '',
            key: last?.pinKey ?? '',
            section: 'pin',
          }),
        };
      }
      if (items.length === limit) {
        return {
          items: items.map(({ session }) => session),
          nextCursor: encodeCursor({ id: '', key: '', section: 'entity' }),
        };
      }
    }

    const remaining = limit - items.length;
    const pinned = this.db
      .select({ id: pinTable.entityId })
      .from(pinTable)
      .where(eq(pinTable.entityType, 'session'));
    const entityAfter: SQL | undefined =
      cursor.section === 'entity' && cursor.key
        ? or(
            gt(agentSessionTable.orderKey, cursor.key),
            and(eq(agentSessionTable.orderKey, cursor.key), gt(agentSessionTable.id, cursor.id)),
          )
        : undefined;
    const rows = await this.db
      .select()
      .from(agentSessionTable)
      .where(and(agentFilter, notInArray(agentSessionTable.id, pinned), entityAfter))
      .orderBy(asc(agentSessionTable.orderKey), asc(agentSessionTable.id))
      .limit(remaining + 1);
    const hasMore = rows.length > remaining;
    const page = rows.slice(0, remaining);
    const hydrated = await this.hydrateSessions(this.db, page);
    for (const row of hydrated) items.push({ session: rowToSession(row) });
    const tail = page.at(-1);
    return {
      items: items.map(({ session }) => session),
      nextCursor:
        hasMore && tail
          ? encodeCursor({
              id: tail.id,
              key: tail.orderKey,
              section: 'entity',
            })
          : undefined,
    };
  }

  async create(dto: CreateAgentSessionDto): Promise<AgentSessionEntity> {
    const id = uuidv4();
    await this.dbService.withWriteTx(async (tx) => {
      const [agent] = await tx
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(eq(agentTable.id, dto.agentId))
        .limit(1);
      if (!agent) throw DataApiErrorFactory.notFound('Agent', dto.agentId);
      const createdAt = Date.now();
      let workspaceId: string;
      if (dto.workspace.type === AGENT_WORKSPACE_TYPE.USER) {
        workspaceId = (await this.workspaceService.getRowByIdTx(tx, dto.workspace.workspaceId)).id;
      } else {
        workspaceId = (
          await this.workspaceService.createSystemWorkspaceForSessionTx(tx, {
            createdAt,
            sessionId: id,
          })
        ).id;
      }
      await insertWithOrderKey(
        tx,
        agentSessionTable,
        {
          agentId: dto.agentId,
          createdAt,
          description: dto.description,
          id,
          name: dto.name,
          updatedAt: createdAt,
          workspaceId,
        },
        { pkColumn: agentSessionTable.id, position: 'first' },
      );
    });
    return this.getById(id);
  }

  async update(id: string, dto: UpdateAgentSessionDto): Promise<AgentSessionEntity> {
    const patch: UpdateAgentSessionDto = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
      patch.isNameManuallyEdited = dto.isNameManuallyEdited ?? true;
    } else if (dto.isNameManuallyEdited !== undefined) {
      patch.isNameManuallyEdited = dto.isNameManuallyEdited;
    }
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.agentId !== undefined) patch.agentId = dto.agentId;
    if (Object.keys(patch).length > 0) {
      const rows = await this.dbService.withWriteTx((tx) =>
        tx.update(agentSessionTable).set(patch).where(eq(agentSessionTable.id, id)).returning(),
      );
      if (rows.length === 0) throw DataApiErrorFactory.notFound('Session', id);
    }
    return this.getById(id);
  }

  async setWorkspace(id: string, source: AgentSessionWorkspaceSource): Promise<AgentSessionEntity> {
    await this.dbService.withWriteTx(async (tx) => {
      const current = await this.joinedById(tx, id);
      const [message] = await tx
        .select({ id: agentSessionMessageTable.id })
        .from(agentSessionMessageTable)
        .where(eq(agentSessionMessageTable.sessionId, id))
        .limit(1);
      if (message) {
        throw DataApiErrorFactory.invalidOperation(
          'update session workspace',
          'workspace cannot be changed after messages are sent',
        );
      }
      let workspaceId = current.session.workspaceId;
      if (source.type === AGENT_WORKSPACE_TYPE.USER) {
        workspaceId = (await this.workspaceService.getRowByIdTx(tx, source.workspaceId)).id;
      } else if (current.workspace.type !== AGENT_WORKSPACE_TYPE.SYSTEM) {
        workspaceId = (
          await this.workspaceService.createSystemWorkspaceForSessionTx(tx, {
            createdAt: current.session.createdAt,
            sessionId: id,
          })
        ).id;
      }
      if (workspaceId === current.session.workspaceId) return;
      await tx.update(agentSessionTable).set({ workspaceId }).where(eq(agentSessionTable.id, id));
      if (current.workspace.type === AGENT_WORKSPACE_TYPE.SYSTEM) {
        await this.workspaceService.deleteByIdTx(tx, current.workspace.id);
      }
    });
    return this.getById(id);
  }

  private async deleteJoinedRows(tx: DbOrTx, rows: JoinedRow[]): Promise<string[]> {
    const ids = rows.map(({ session }) => session.id);
    if (ids.length === 0) return [];
    await this.pinService.purgeForEntitiesTx(tx, 'session', ids);
    await tx.delete(agentSessionTable).where(inArray(agentSessionTable.id, ids));
    const systemWorkspaceIds = rows
      .filter(({ workspace }) => workspace.type === AGENT_WORKSPACE_TYPE.SYSTEM)
      .map(({ workspace }) => workspace.id);
    if (systemWorkspaceIds.length) {
      await tx
        .delete(agentWorkspaceTable)
        .where(inArray(agentWorkspaceTable.id, systemWorkspaceIds));
    }
    return ids;
  }

  async delete(id: string): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const row = await this.joinedById(tx, id);
      await this.deleteJoinedRows(tx, [row]);
    });
  }

  async deleteByIds(ids: string[]): Promise<DeleteAgentSessionsResult> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return { deletedIds: [] };
    const deletedIds = await this.dbService.withWriteTx(async (tx) => {
      const sessions = await tx
        .select()
        .from(agentSessionTable)
        .where(inArray(agentSessionTable.id, uniqueIds));
      const rows = await this.hydrateSessions(tx, sessions);
      return this.deleteJoinedRows(tx, rows);
    });
    return { deletedIds };
  }

  async deleteByAgentId(agentId: string): Promise<DeleteAgentSessionsResult> {
    const deletedIds = await this.dbService.withWriteTx((tx) =>
      this.deleteByAgentIdTx(tx, agentId),
    );
    return { deletedIds };
  }

  async deleteByAgentIdTx(
    tx: DbOrTx,
    agentId: string,
    options: { validateAgent?: boolean } = {},
  ): Promise<string[]> {
    if (options.validateAgent ?? true) {
      const [agent] = await tx
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(eq(agentTable.id, agentId))
        .limit(1);
      if (!agent) throw DataApiErrorFactory.notFound('Agent', agentId);
    }
    const sessions = await tx
      .select()
      .from(agentSessionTable)
      .where(eq(agentSessionTable.agentId, agentId));
    const rows = await this.hydrateSessions(tx, sessions);
    return this.deleteJoinedRows(tx, rows);
  }

  async deleteWorkspaceCascade(workspaceId: string): Promise<DeleteAgentSessionsResult> {
    const deletedIds = await this.dbService.withWriteTx(async (tx) => {
      await this.workspaceService.getRowByIdTx(tx, workspaceId);
      const sessions = await tx
        .select()
        .from(agentSessionTable)
        .where(eq(agentSessionTable.workspaceId, workspaceId));
      const rows = await this.hydrateSessions(tx, sessions);
      const ids = await this.deleteJoinedRows(tx, rows);
      await this.workspaceService.deleteByIdTx(tx, workspaceId);
      return ids;
    });
    return { deletedIds };
  }

  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      applyMoves(tx, agentSessionTable, [{ anchor, id }], {
        pkColumn: agentSessionTable.id,
      }),
    );
  }

  async reorderBatch(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      applyMoves(tx, agentSessionTable, moves, { pkColumn: agentSessionTable.id }),
    );
  }
}
