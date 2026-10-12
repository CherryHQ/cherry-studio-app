import { and, asc, eq, gt, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import {
  type AgentGlobalSkillRow,
  agentGlobalSkillTable,
  type AgentSkillRow,
  agentSkillTable,
  agentTable,
  type InsertAgentGlobalSkillRow,
  monotonicUpdateTimestamp,
} from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  type AgentSkillUpdate,
  type ListSkillsQueryParams,
  ListSkillsQuerySchema,
  ReplaceAgentSkillsSchema,
  type ReplaceAgentSkillsInput,
  type UpdateSkillDto,
  UpdateSkillSchema,
} from '@/shared/data/api/schemas/skills';
import {
  type AgentSkillBinding,
  AgentSkillBindingSchema,
  type Skill,
  type SkillInvocation,
  type SkillManifestEntry,
  type SkillProfile,
  SkillSchema,
  type SkillSourceKind,
} from '@/shared/data/types/skill';

import { timestampToISO } from './utils/rowMappers';

/** Persisted facts the installer commits; timestamps and ids are allocated here. */
export type SkillInstallRecord = {
  name: string;
  description: string;
  source: SkillSourceKind;
  sourceUrl: string | null;
  author: string | null;
  version: string | null;
  tags: string[];
  contentHash: string;
  manifest: SkillManifestEntry[];
  profile: SkillProfile;
  invocation: SkillInvocation;
};

export type SkillListEntry = {
  skill: Skill;
  /** Present for Agent-scoped reads; `null` means unbound. */
  binding: AgentSkillBinding | null;
};

export type ListSkillsResult = {
  items: SkillListEntry[];
  nextCursor?: string;
};

/** Everything an Agent turn needs to know before evaluating environment eligibility. */
export type AgentSkillProjection = {
  skill: Skill;
  binding: AgentSkillBinding;
};

export function rowToSkill(row: AgentGlobalSkillRow): Skill {
  return SkillSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    folderName: row.folderName,
    source: row.source,
    sourceUrl: row.sourceUrl,
    author: row.author,
    version: row.version,
    tags: row.tags,
    contentHash: row.contentHash,
    manifest: row.manifest,
    profile: row.profile,
    invocation: row.invocation,
    isEnabled: row.isEnabled,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  });
}

function rowToBinding(row: AgentSkillRow): AgentSkillBinding {
  return AgentSkillBindingSchema.parse({
    agentId: row.agentId,
    skillId: row.skillId,
    isEnabled: row.isEnabled,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  });
}

export function encodeSkillCursor(row: Pick<AgentGlobalSkillRow, 'id' | 'name'>): string {
  return JSON.stringify([row.name, row.id]);
}

function decodeCursor(cursor: string): { id: string; name: string } {
  try {
    const parsed = JSON.parse(cursor) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return { name: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw DataApiErrorFactory.validation({ cursor: ['Invalid pagination cursor'] });
}

function escapeLike(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Persistence for the installed Skill library and Agent bindings.
 *
 * Global enablement and Agent enablement are user intent and live here.
 * Environment admission is derived by the Skills workflow owner from these
 * facts; this service never stores an availability boolean.
 */
export class AgentGlobalSkillService {
  private get dbService() {
    return application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async getById(skillId: string): Promise<Skill> {
    const [row] = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(
        and(eq(agentGlobalSkillTable.id, skillId), eq(agentGlobalSkillTable.source, 'marketplace')),
      )
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('Skill', skillId);
    }
    return rowToSkill(row);
  }

  /** Folder names are package names; like desktop, one folder holds one installation. */
  async findByFolderName(folderName: string): Promise<Skill | null> {
    const [row] = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(
        and(
          eq(agentGlobalSkillTable.folderName, folderName),
          eq(agentGlobalSkillTable.source, 'marketplace'),
        ),
      )
      .limit(1);
    return row ? rowToSkill(row) : null;
  }

  /**
   * Scoped, bounded metadata search. The scope filter is part of the SQL
   * predicate, so pagination and emptiness reflect the authorized set and a
   * globally matching Skill outside the scope never consumes a page slot.
   */
  async list(params: ListSkillsQueryParams): Promise<ListSkillsResult> {
    const query = ListSkillsQuerySchema.parse(params);
    // App-owned system workflows are not part of the user-managed library,
    // including copies installed by earlier builds.
    const conditions: SQL[] = [eq(agentGlobalSkillTable.source, 'marketplace')];
    if (query.search) {
      const pattern = escapeLike(query.search);
      conditions.push(
        or(
          sql`${agentGlobalSkillTable.name} LIKE ${pattern} ESCAPE '\\'`,
          sql`${agentGlobalSkillTable.description} LIKE ${pattern} ESCAPE '\\'`,
        )!,
      );
    }
    if (query.cursor) {
      const { name, id } = decodeCursor(query.cursor);
      conditions.push(
        or(
          gt(agentGlobalSkillTable.name, name),
          and(eq(agentGlobalSkillTable.name, name), gt(agentGlobalSkillTable.id, id)),
        )!,
      );
    }
    const agentId = query.agentId;
    if (query.scope === 'composer' && agentId) {
      conditions.push(
        eq(agentGlobalSkillTable.isEnabled, true),
        inArray(agentGlobalSkillTable.id, enabledBindingSkillIds(agentId)),
        sql`json_extract(${agentGlobalSkillTable.invocation}, '$.userInvocable') = 1`,
      );
    }

    // Joins are avoided on purpose: the drivers return rows keyed by column
    // name, so a join would collapse the shared timestamp columns.
    const rows = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(and(...conditions))
      .orderBy(asc(agentGlobalSkillTable.name), asc(agentGlobalSkillTable.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const bindings = agentId
      ? await this.readBindings(
          agentId,
          page.map((row) => row.id),
        )
      : new Map<string, AgentSkillBinding>();
    return {
      items: page.map((row) => ({
        skill: rowToSkill(row),
        binding: bindings.get(row.id) ?? null,
      })),
      ...(rows.length > query.limit && last ? { nextCursor: encodeSkillCursor(last) } : {}),
    };
  }

  private async readBindings(
    agentId: string,
    skillIds: readonly string[],
  ): Promise<Map<string, AgentSkillBinding>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(agentSkillTable)
      .where(and(eq(agentSkillTable.agentId, agentId), inArray(agentSkillTable.skillId, skillIds)));
    return new Map(rows.map((row) => [row.skillId, rowToBinding(row)]));
  }

  async update(skillId: string, input: UpdateSkillDto): Promise<Skill> {
    const dto = UpdateSkillSchema.parse(input);
    const row = await this.dbService.withWriteTx(async (tx) => {
      const [updated] = await tx
        .update(agentGlobalSkillTable)
        .set({
          isEnabled: dto.isEnabled,
          updatedAt: monotonicUpdateTimestamp(agentGlobalSkillTable.updatedAt),
        })
        .where(
          and(
            eq(agentGlobalSkillTable.id, skillId),
            eq(agentGlobalSkillTable.source, 'marketplace'),
          ),
        )
        .returning();
      if (!updated) {
        throw DataApiErrorFactory.notFound('Skill', skillId);
      }
      return updated;
    });
    return rowToSkill(row);
  }

  async listBindings(agentId: string): Promise<{ items: AgentSkillBinding[] }> {
    await this.assertAgentWritable(this.db, agentId);
    const rows = await this.db
      .select()
      .from(agentSkillTable)
      .where(
        and(
          eq(agentSkillTable.agentId, agentId),
          inArray(agentSkillTable.skillId, userSkillIds(this.db)),
        ),
      )
      .orderBy(asc(agentSkillTable.skillId));
    return { items: rows.map(rowToBinding) };
  }

  /**
   * Applies the listed updates in one transaction and preserves every other
   * binding. Referenced Skills are rechecked inside the transaction so a
   * concurrent uninstall cannot leave a dangling preference.
   */
  async replaceBindings(
    agentId: string,
    input: ReplaceAgentSkillsInput,
  ): Promise<{ items: AgentSkillBinding[] }> {
    const { updates } = ReplaceAgentSkillsSchema.parse(input);
    const rows = await this.dbService.withWriteTx(async (tx) => {
      await this.assertAgentWritable(tx, agentId);
      await this.applyBindingUpdatesTx(tx, agentId, updates);
      return tx
        .select()
        .from(agentSkillTable)
        .where(
          and(
            eq(agentSkillTable.agentId, agentId),
            inArray(agentSkillTable.skillId, userSkillIds(tx)),
          ),
        );
    });
    return { items: rows.map(rowToBinding) };
  }

  async applyBindingUpdatesTx(
    tx: Database,
    agentId: string,
    updates: readonly AgentSkillUpdate[],
  ): Promise<void> {
    const byId = new Map(updates.map((update) => [update.skillId, update.isEnabled] as const));
    if (byId.size !== updates.length) {
      throw DataApiErrorFactory.validation({ updates: ['Duplicate skillId'] });
    }
    const skillIds = [...byId.keys()];
    if (skillIds.length === 0) return;
    const liveRows = await tx
      .select({ id: agentGlobalSkillTable.id })
      .from(agentGlobalSkillTable)
      .where(
        and(
          inArray(agentGlobalSkillTable.id, skillIds),
          eq(agentGlobalSkillTable.source, 'marketplace'),
        ),
      );
    const live = new Set(liveRows.map((row) => row.id));
    const missing = skillIds.filter((id) => !live.has(id));
    if (missing.length > 0) {
      throw DataApiErrorFactory.notFound('Skill', missing[0]);
    }
    const removals = skillIds.filter((id) => byId.get(id) === null);
    if (removals.length > 0) {
      await tx
        .delete(agentSkillTable)
        .where(
          and(eq(agentSkillTable.agentId, agentId), inArray(agentSkillTable.skillId, removals)),
        );
    }
    for (const skillId of skillIds) {
      const isEnabled = byId.get(skillId);
      if (isEnabled === null || isEnabled === undefined) continue;
      await tx
        .insert(agentSkillTable)
        .values({ agentId, skillId, isEnabled })
        .onConflictDoUpdate({
          target: [agentSkillTable.agentId, agentSkillTable.skillId],
          set: { isEnabled, updatedAt: monotonicUpdateTimestamp(agentSkillTable.updatedAt) },
        });
    }
  }

  /** The Host's view: installed, globally enabled, and bound-enabled for this Agent. */
  async listUsableForAgent(agentId: string): Promise<AgentSkillProjection[]> {
    const rows = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(
        and(
          eq(agentGlobalSkillTable.source, 'marketplace'),
          eq(agentGlobalSkillTable.isEnabled, true),
          inArray(agentGlobalSkillTable.id, enabledBindingSkillIds(agentId)),
        ),
      )
      .orderBy(asc(agentGlobalSkillTable.name), asc(agentGlobalSkillTable.id));
    const bindings = await this.readBindings(
      agentId,
      rows.map((row) => row.id),
    );
    return rows.flatMap((row) => {
      const binding = bindings.get(row.id);
      return binding ? [{ skill: rowToSkill(row), binding }] : [];
    });
  }

  /** Inserts the accepted package record; the caller has already published its bytes. */
  async createTx(
    tx: Database,
    record: SkillInstallRecord,
    agentIds: readonly string[] = [],
  ): Promise<Skill> {
    const [existing] = await tx
      .select({ id: agentGlobalSkillTable.id, source: agentGlobalSkillTable.source })
      .from(agentGlobalSkillTable)
      .where(eq(agentGlobalSkillTable.folderName, record.name))
      .limit(1);
    if (existing?.source === 'marketplace') {
      throw DataApiErrorFactory.conflict('Skill is already installed', record.name);
    }
    // A hidden legacy system copy must not reserve a user package's folder.
    // Its immutable bytes remain until the ordinary startup reconciliation.
    if (existing) await this.deleteTx(tx, existing.id);
    const [row] = await tx
      .insert(agentGlobalSkillTable)
      .values({ ...toInsertRow(record), folderName: record.name, isEnabled: true })
      .returning();
    if (!row) throw new Error('Skill insert returned no row.');
    if (agentIds.length > 0) {
      for (const agentId of new Set(agentIds)) {
        await this.assertAgentWritable(tx, agentId);
        await tx.insert(agentSkillTable).values({ agentId, skillId: row.id, isEnabled: true });
      }
    }
    return rowToSkill(row);
  }

  /** Switches the accepted revision in place, keeping id, folder, enablement, and bindings. */
  async updateRevisionTx(
    tx: Database,
    skillId: string,
    record: SkillInstallRecord,
  ): Promise<Skill> {
    const [row] = await tx
      .update(agentGlobalSkillTable)
      .set({
        ...toInsertRow(record),
        updatedAt: monotonicUpdateTimestamp(agentGlobalSkillTable.updatedAt),
      })
      .where(eq(agentGlobalSkillTable.id, skillId))
      .returning();
    if (!row) {
      throw DataApiErrorFactory.notFound('Skill', skillId);
    }
    return rowToSkill(row);
  }

  /** Deletes the installation and its bindings; startup reconciliation removes the bytes. */
  async deleteTx(tx: Database, skillId: string): Promise<void> {
    await tx.delete(agentSkillTable).where(eq(agentSkillTable.skillId, skillId));
    const [row] = await tx
      .delete(agentGlobalSkillTable)
      .where(eq(agentGlobalSkillTable.id, skillId))
      .returning({ id: agentGlobalSkillTable.id });
    if (!row) {
      throw DataApiErrorFactory.notFound('Skill', skillId);
    }
  }

  /** Folders and hashes in use, for storage reconciliation. */
  async listStorageReferences(): Promise<{ folderName: string; contentHash: string }[]> {
    return this.db
      .select({
        folderName: agentGlobalSkillTable.folderName,
        contentHash: agentGlobalSkillTable.contentHash,
      })
      .from(agentGlobalSkillTable);
  }

  private async assertAgentWritable(tx: Database, agentId: string): Promise<void> {
    const [agent] = await tx
      .select({ id: agentTable.id })
      .from(agentTable)
      .where(and(eq(agentTable.id, agentId), isNull(agentTable.deletedAt)))
      .limit(1);
    if (!agent) {
      throw DataApiErrorFactory.notFound('Agent', agentId);
    }
  }
}

function userSkillIds(db: Database) {
  return db
    .select({ id: agentGlobalSkillTable.id })
    .from(agentGlobalSkillTable)
    .where(eq(agentGlobalSkillTable.source, 'marketplace'));
}

function enabledBindingSkillIds(agentId: string) {
  return application
    .get('DbService')
    .getDb()
    .select({ skillId: agentSkillTable.skillId })
    .from(agentSkillTable)
    .where(and(eq(agentSkillTable.agentId, agentId), eq(agentSkillTable.isEnabled, true)));
}

function toInsertRow(
  record: SkillInstallRecord,
): Omit<InsertAgentGlobalSkillRow, 'folderName' | 'id' | 'createdAt' | 'updatedAt' | 'isEnabled'> {
  return {
    name: record.name,
    description: record.description,
    source: record.source,
    sourceUrl: record.sourceUrl,
    author: record.author,
    version: record.version,
    tags: record.tags,
    contentHash: record.contentHash,
    manifest: record.manifest,
    profile: record.profile,
    invocation: record.invocation,
  };
}

export const agentGlobalSkillService = new AgentGlobalSkillService();
