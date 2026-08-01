import { and, asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';

import type { Database, DbService } from '@/backend/data/db/DbService';
import {
  type AgentGlobalSkillRow,
  agentGlobalSkillTable,
  agentSessionTable,
  agentSkillTable,
  agentTable,
  agentWorkspaceTable,
  type InsertAgentGlobalSkillRow,
} from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@cherrystudio/shared/data/api/errors';
import type { AgentSkillUpdateDto } from '@cherrystudio/shared/data/api/schemas/agents';
import type { InstalledSkill, ListSkillsQuery } from '@cherrystudio/shared/data/api/schemas/skills';

import { timestampToISO } from './utils/rowMappers';

type SkillPatch = Partial<Omit<InsertAgentGlobalSkillRow, 'createdAt' | 'id' | 'updatedAt'>>;

/** Pure database access for global skills and their per-agent enablement rows. */
export class AgentGlobalSkillService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  async getById(id: string): Promise<InstalledSkill | null> {
    const [row] = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(eq(agentGlobalSkillTable.id, id))
      .limit(1);
    return row ? this.rowToInstalledSkill(row) : null;
  }

  async getByFolderName(folderName: string): Promise<InstalledSkill | null> {
    const [row] = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(eq(agentGlobalSkillTable.folderName, folderName))
      .limit(1);
    return row ? this.rowToInstalledSkill(row) : null;
  }

  async list(query: ListSkillsQuery = {}): Promise<InstalledSkill[]> {
    const conditions: SQL[] = [];
    if (query.agentId) {
      const [agent] = await this.db
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(and(eq(agentTable.id, query.agentId), sql`${agentTable.deletedAt} IS NULL`))
        .limit(1);
      if (!agent) throw DataApiErrorFactory.notFound('Agent', query.agentId);
    }

    if (query.search) {
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      const search = or(
        sql`${agentGlobalSkillTable.name} LIKE ${pattern} ESCAPE '\\'`,
        sql`${agentGlobalSkillTable.description} LIKE ${pattern} ESCAPE '\\'`,
      );
      if (search) conditions.push(search);
    }

    const rows = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(agentGlobalSkillTable.createdAt));
    const skills = rows.map((row) => this.rowToInstalledSkill(row));
    if (!query.agentId) return skills.map((skill) => ({ ...skill, isEnabled: false }));

    const enabledMap = await this.loadEnabledMap(query.agentId);
    return skills.map((skill) => ({
      ...skill,
      isEnabled: enabledMap.get(skill.id) ?? skill.source === 'builtin',
    }));
  }

  async listAll(): Promise<InstalledSkill[]> {
    const rows = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .orderBy(asc(agentGlobalSkillTable.createdAt));
    return rows.map((row) => this.rowToInstalledSkill(row));
  }

  async insert(values: InsertAgentGlobalSkillRow): Promise<AgentGlobalSkillRow> {
    return await this.insertTx(this.db, values);
  }

  async insertTx(tx: Database, values: InsertAgentGlobalSkillRow): Promise<AgentGlobalSkillRow> {
    const [inserted] = await tx.insert(agentGlobalSkillTable).values(values).returning();
    if (!inserted) throw new Error(`Failed to insert agent_global_skill row: ${values.folderName}`);
    return inserted;
  }

  async update(id: string, patch: SkillPatch): Promise<void> {
    await this.updateTx(this.db, id, patch);
  }

  async updateTx(tx: Database, id: string, patch: SkillPatch): Promise<void> {
    await tx.update(agentGlobalSkillTable).set(patch).where(eq(agentGlobalSkillTable.id, id));
  }

  async deleteById(id: string): Promise<void> {
    await this.deleteByIdTx(this.db, id);
  }

  async deleteByIdTx(tx: Database, id: string): Promise<void> {
    await tx.delete(agentGlobalSkillTable).where(eq(agentGlobalSkillTable.id, id));
  }

  async listJoinByAgent(agentId: string): Promise<Array<{ isEnabled: boolean; skillId: string }>> {
    return await this.db
      .select({ isEnabled: agentSkillTable.isEnabled, skillId: agentSkillTable.skillId })
      .from(agentSkillTable)
      .where(eq(agentSkillTable.agentId, agentId));
  }

  async listJoinBySkill(skillId: string): Promise<Array<{ agentId: string; isEnabled: boolean }>> {
    return await this.db
      .select({ agentId: agentSkillTable.agentId, isEnabled: agentSkillTable.isEnabled })
      .from(agentSkillTable)
      .where(eq(agentSkillTable.skillId, skillId));
  }

  async upsertJoin(agentId: string, skillId: string, isEnabled: boolean): Promise<void> {
    await this.upsertJoinTx(this.db, agentId, skillId, isEnabled);
  }

  async upsertJoinTx(
    tx: Database,
    agentId: string,
    skillId: string,
    isEnabled: boolean,
  ): Promise<void> {
    await tx
      .insert(agentSkillTable)
      .values({ agentId, isEnabled, skillId })
      .onConflictDoUpdate({
        set: { isEnabled },
        target: [agentSkillTable.agentId, agentSkillTable.skillId],
      });
  }

  async assertSkillsExistTx(
    tx: Database,
    skillIds: readonly string[],
    operation: string,
  ): Promise<void> {
    const uniqueSkillIds = Array.from(new Set(skillIds));
    if (uniqueSkillIds.length === 0) return;
    const rows = await tx
      .select({ id: agentGlobalSkillTable.id })
      .from(agentGlobalSkillTable)
      .where(inArray(agentGlobalSkillTable.id, uniqueSkillIds));
    if (rows.length !== uniqueSkillIds.length) {
      throw DataApiErrorFactory.invalidOperation(operation, 'a selected skill no longer exists');
    }
  }

  async applyJoinUpdatesByAgentTx(
    tx: Database,
    agentId: string,
    skillUpdates: readonly AgentSkillUpdateDto[],
  ): Promise<void> {
    const bySkillId = new Map<string, AgentSkillUpdateDto>();
    for (const update of skillUpdates) bySkillId.set(update.skillId, update);
    const updates = [...bySkillId.values()];
    await this.assertSkillsExistTx(
      tx,
      updates.map((update) => update.skillId),
      'update agent',
    );
    for (const update of updates) {
      await this.upsertJoinTx(tx, agentId, update.skillId, update.isEnabled);
    }
  }

  async upsertJoinForAllAgents(skillId: string, isEnabled: boolean): Promise<string[]> {
    return await this.dbService.withWriteTx((tx) =>
      this.upsertJoinForAllAgentsTx(tx, skillId, isEnabled),
    );
  }

  async upsertJoinForAllAgentsTx(
    tx: Database,
    skillId: string,
    isEnabled: boolean,
  ): Promise<string[]> {
    const agents = await tx.select({ id: agentTable.id }).from(agentTable);
    for (const agent of agents) {
      await this.upsertJoinTx(tx, agent.id, skillId, isEnabled);
    }
    return agents.map((agent) => agent.id);
  }

  async listAgentSessionWorkspacePaths(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ workspacePath: agentWorkspaceTable.path })
      .from(agentSessionTable)
      .leftJoin(agentWorkspaceTable, eq(agentSessionTable.workspaceId, agentWorkspaceTable.id))
      .where(eq(agentSessionTable.agentId, agentId));
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const row of rows) {
      const path = row.workspacePath ?? undefined;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
    return paths;
  }

  private async loadEnabledMap(agentId: string): Promise<Map<string, boolean>> {
    const rows = await this.listJoinByAgent(agentId);
    return new Map(rows.map((row) => [row.skillId, row.isEnabled]));
  }

  private rowToInstalledSkill(row: AgentGlobalSkillRow): InstalledSkill {
    return {
      author: row.author,
      contentHash: row.contentHash,
      createdAt: timestampToISO(row.createdAt),
      description: row.description,
      folderName: row.folderName,
      id: row.id,
      isEnabled: row.isEnabled,
      name: row.name,
      namespace: row.namespace,
      source: row.source,
      sourceTags: row.tags,
      sourceUrl: row.sourceUrl,
      updatedAt: timestampToISO(row.updatedAt),
      version: row.version,
    };
  }
}
