import { and, asc, eq } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import {
  type AgentWorkspaceRow,
  agentWorkspaceTable,
} from '@/backend/data/db/schemas/agentWorkspace';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type { OrderRequest } from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import {
  AGENT_WORKSPACE_TYPE,
  type AgentWorkspaceEntity,
  AgentWorkspaceTypeSchema,
  type UpdateAgentWorkspaceDto,
} from '@cherrystudio/universal/data/api/schemas/agentWorkspaces';

import { applyMoves, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

type DbOrTx = any;
type LookupOptions = { includeSystem?: boolean };

export function rowToAgentWorkspace(row: AgentWorkspaceRow): AgentWorkspaceEntity {
  return {
    createdAt: timestampToISO(row.createdAt),
    id: row.id,
    name: row.name,
    orderKey: row.orderKey,
    path: row.path,
    type: AgentWorkspaceTypeSchema.parse(row.type),
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function normalizeWorkspaceName(value: string): string {
  const name = value.trim();
  if (!name) throw DataApiErrorFactory.validation({ name: ['Workspace name is required'] });
  return name;
}

function normalizeWorkspacePath(value: string): string {
  let workspacePath = value.trim();
  if (!workspacePath) {
    throw DataApiErrorFactory.validation({ path: ['Workspace path is required'] });
  }
  if (!/^(?:\/|[A-Za-z]:[\\/]|file:\/\/)/.test(workspacePath)) {
    throw DataApiErrorFactory.validation({ path: ['Workspace path must be absolute'] });
  }
  while (workspacePath.length > 1 && /[\\/]$/.test(workspacePath)) {
    workspacePath = workspacePath.slice(0, -1);
  }
  return workspacePath;
}

function defaultWorkspaceName(workspacePath: string): string {
  return workspacePath.split(/[\\/]/).filter(Boolean).at(-1) ?? workspacePath;
}

export class AgentWorkspaceService {
  constructor(private readonly dbService: DbService) {}

  async list(options: LookupOptions = {}): Promise<AgentWorkspaceEntity[]> {
    const rows = await this.dbService
      .getDb()
      .select()
      .from(agentWorkspaceTable)
      .where(
        options.includeSystem ? undefined : eq(agentWorkspaceTable.type, AGENT_WORKSPACE_TYPE.USER),
      )
      .orderBy(asc(agentWorkspaceTable.orderKey), asc(agentWorkspaceTable.id));
    return rows.map(rowToAgentWorkspace);
  }

  async getById(id: string, options: LookupOptions = {}): Promise<AgentWorkspaceEntity> {
    return rowToAgentWorkspace(await this.getRowByIdTx(this.dbService.getDb(), id, options));
  }

  async getRowByIdTx(
    tx: DbOrTx,
    id: string,
    options: LookupOptions = {},
  ): Promise<AgentWorkspaceRow> {
    const [row] = await tx
      .select()
      .from(agentWorkspaceTable)
      .where(
        options.includeSystem
          ? eq(agentWorkspaceTable.id, id)
          : and(
              eq(agentWorkspaceTable.id, id),
              eq(agentWorkspaceTable.type, AGENT_WORKSPACE_TYPE.USER),
            ),
      )
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('Workspace', id);
    return row;
  }

  async findOrCreateByPath(
    rawPath: string,
    options: { name?: string } = {},
  ): Promise<AgentWorkspaceEntity> {
    const workspacePath = normalizeWorkspacePath(rawPath);
    const row = await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(agentWorkspaceTable)
        .where(eq(agentWorkspaceTable.path, workspacePath))
        .limit(1);
      if (existing) {
        if (existing.type !== AGENT_WORKSPACE_TYPE.USER) {
          throw DataApiErrorFactory.conflict(
            `Workspace path '${workspacePath}' already exists`,
            'Workspace',
          );
        }
        return existing;
      }
      return (await insertWithOrderKey(
        tx,
        agentWorkspaceTable,
        {
          name: options.name?.trim() || defaultWorkspaceName(workspacePath),
          path: workspacePath,
          type: AGENT_WORKSPACE_TYPE.USER,
        },
        { pkColumn: agentWorkspaceTable.id, position: 'first' },
      )) as AgentWorkspaceRow;
    });
    return rowToAgentWorkspace(row);
  }

  async createSystemWorkspaceForSessionTx(
    tx: DbOrTx,
    input: { createdAt: number; sessionId: string },
  ): Promise<AgentWorkspaceRow> {
    if (!input.sessionId || /[\\/]/.test(input.sessionId)) {
      throw DataApiErrorFactory.validation({ sessionId: ['Invalid agent session id'] });
    }
    const date = new Date(input.createdAt);
    const day = date.toISOString().slice(0, 10);
    const path = `/agent-system-workspaces/${day}/${input.sessionId}`;
    return (await insertWithOrderKey(
      tx,
      agentWorkspaceTable,
      {
        name: input.sessionId,
        path,
        type: AGENT_WORKSPACE_TYPE.SYSTEM,
      },
      { pkColumn: agentWorkspaceTable.id, position: 'first' },
    )) as AgentWorkspaceRow;
  }

  async update(id: string, dto: UpdateAgentWorkspaceDto): Promise<AgentWorkspaceEntity> {
    const [row] = await this.dbService.withWriteTx(async (tx) => {
      await this.getRowByIdTx(tx, id);
      return tx
        .update(agentWorkspaceTable)
        .set({ name: normalizeWorkspaceName(dto.name) })
        .where(
          and(
            eq(agentWorkspaceTable.id, id),
            eq(agentWorkspaceTable.type, AGENT_WORKSPACE_TYPE.USER),
          ),
        )
        .returning();
    });
    if (!row) throw DataApiErrorFactory.notFound('Workspace', id);
    return rowToAgentWorkspace(row);
  }

  async deleteByIdTx(tx: DbOrTx, id: string): Promise<void> {
    const rows = await tx
      .delete(agentWorkspaceTable)
      .where(eq(agentWorkspaceTable.id, id))
      .returning({ id: agentWorkspaceTable.id });
    if (rows.length === 0) throw DataApiErrorFactory.notFound('Workspace', id);
  }

  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      await this.getRowByIdTx(tx, id);
      await applyMoves(tx, agentWorkspaceTable, [{ anchor, id }], {
        pkColumn: agentWorkspaceTable.id,
        scope: eq(agentWorkspaceTable.type, AGENT_WORKSPACE_TYPE.USER),
      });
    });
  }

  async reorderBatch(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      for (const move of moves) {
        // react-doctor-disable-next-line async-await-in-loop -- validates a transactional ordered sequence.
        await this.getRowByIdTx(tx, move.id);
      }
      await applyMoves(tx, agentWorkspaceTable, moves, {
        pkColumn: agentWorkspaceTable.id,
        scope: eq(agentWorkspaceTable.type, AGENT_WORKSPACE_TYPE.USER),
      });
    });
  }
}
