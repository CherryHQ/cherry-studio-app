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
  type SkillSource,
} from '@/shared/data/types/skill';

import { timestampToISO } from './utils/rowMappers';

/** Persisted facts the installer commits; timestamps and ids are allocated here. */
export type SkillInstallRecord = {
  name: string;
  description: string;
  source: SkillSource;
  author: string | null;
  version: string | null;
  license: string | null;
  compatibility: string | null;
  tags: string[];
  entryDigest: string;
  packageDigest: string;
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
    description: row.description,
    folderName: row.folderName,
    source: {
      registry: row.sourceRegistry,
      locator: row.sourceLocator,
      url: row.sourceUrl,
      revision: row.sourceRevision,
      ...(row.profile.discovery ? { discovery: row.profile.discovery } : {}),
    },
    author: row.author,
    version: row.version,
    license: row.license,
    compatibility: row.compatibility,
    tags: row.tags,
    entryDigest: row.entryDigest,
    packageDigest: row.packageDigest,
    manifest: row.manifest,
    profile: row.profile,
    invocation: row.invocation,
    isGlobalEnabled: row.isGlobalEnabled,
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
    const row = await this.findLiveRow(this.db, skillId);
    if (!row) {
      throw DataApiErrorFactory.notFound('Skill', skillId);
    }
    return rowToSkill(row);
  }

  async findByLocator(locator: string): Promise<Skill | null> {
    const [row] = await this.db
      .select()
      .from(agentGlobalSkillTable)
      .where(
        and(
          eq(agentGlobalSkillTable.sourceLocator, locator),
          isNull(agentGlobalSkillTable.deletedAt),
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
    const conditions: SQL[] = [isNull(agentGlobalSkillTable.deletedAt)];
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
        eq(agentGlobalSkillTable.isGlobalEnabled, true),
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
          isGlobalEnabled: dto.isGlobalEnabled,
          updatedAt: monotonicUpdateTimestamp(agentGlobalSkillTable.updatedAt),
        })
        .where(and(eq(agentGlobalSkillTable.id, skillId), isNull(agentGlobalSkillTable.deletedAt)))
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
      .where(eq(agentSkillTable.agentId, agentId))
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
      return tx.select().from(agentSkillTable).where(eq(agentSkillTable.agentId, agentId));
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
        and(inArray(agentGlobalSkillTable.id, skillIds), isNull(agentGlobalSkillTable.deletedAt)),
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
          eq(agentGlobalSkillTable.isGlobalEnabled, true),
          isNull(agentGlobalSkillTable.deletedAt),
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
    folderName: string,
    agentIds: readonly string[] = [],
  ): Promise<Skill> {
    const [existing] = await tx
      .select({ id: agentGlobalSkillTable.id })
      .from(agentGlobalSkillTable)
      .where(
        and(
          eq(agentGlobalSkillTable.sourceLocator, record.source.locator),
          isNull(agentGlobalSkillTable.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      throw DataApiErrorFactory.conflict('Skill is already installed', record.source.locator);
    }
    const [row] = await tx
      .insert(agentGlobalSkillTable)
      .values({ ...toInsertRow(record), folderName })
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

  /** Switches the accepted revision in place, keeping id, alias, enablement, and bindings. */
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
      .where(and(eq(agentGlobalSkillTable.id, skillId), isNull(agentGlobalSkillTable.deletedAt)))
      .returning();
    if (!row) {
      throw DataApiErrorFactory.notFound('Skill', skillId);
    }
    return rowToSkill(row);
  }

  /** Tombstones the installation and clears its bindings; bytes are cleaned afterwards. */
  async tombstoneTx(tx: Database, skillId: string): Promise<Skill> {
    const [row] = await tx
      .update(agentGlobalSkillTable)
      .set({
        deletedAt: Date.now(),
        updatedAt: monotonicUpdateTimestamp(agentGlobalSkillTable.updatedAt),
      })
      .where(and(eq(agentGlobalSkillTable.id, skillId), isNull(agentGlobalSkillTable.deletedAt)))
      .returning();
    if (!row) {
      throw DataApiErrorFactory.notFound('Skill', skillId);
    }
    await tx.delete(agentSkillTable).where(eq(agentSkillTable.skillId, skillId));
    return rowToSkill(row);
  }

  /** Aliases and digests in use by live rows, for storage reconciliation. */
  async listStorageReferences(): Promise<{ folderName: string; packageDigest: string }[]> {
    const rows = await this.db
      .select({
        folderName: agentGlobalSkillTable.folderName,
        packageDigest: agentGlobalSkillTable.packageDigest,
        profile: agentGlobalSkillTable.profile,
      })
      .from(agentGlobalSkillTable)
      .where(isNull(agentGlobalSkillTable.deletedAt));
    return rows.flatMap(({ folderName, packageDigest, profile }) => [
      { folderName, packageDigest },
      ...(profile.adaptation
        ? [{ folderName, packageDigest: profile.adaptation.upstreamDigest }]
        : []),
    ]);
  }

  /** Never reuse a tombstoned alias while a previous turn can still hold its revision. */
  async allocateFolderNameTx(tx: Database, name: string): Promise<string> {
    const rows = await tx
      .select({ folderName: agentGlobalSkillTable.folderName })
      .from(agentGlobalSkillTable)
      .where(
        or(
          eq(agentGlobalSkillTable.folderName, name),
          sql`${agentGlobalSkillTable.folderName} LIKE ${`${name}-%`} ESCAPE '\\'`,
        ),
      );
    const taken = new Set(rows.map((row) => row.folderName));
    if (!taken.has(name)) return name;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${name}-${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private async findLiveRow(tx: Database, skillId: string): Promise<AgentGlobalSkillRow | null> {
    const [row] = await tx
      .select()
      .from(agentGlobalSkillTable)
      .where(and(eq(agentGlobalSkillTable.id, skillId), isNull(agentGlobalSkillTable.deletedAt)))
      .limit(1);
    return row ?? null;
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
): Omit<InsertAgentGlobalSkillRow, 'folderName' | 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    name: record.name,
    description: record.description,
    sourceRegistry: record.source.registry,
    sourceLocator: record.source.locator,
    sourceUrl: record.source.url,
    sourceRevision: record.source.revision,
    author: record.author,
    version: record.version,
    license: record.license,
    compatibility: record.compatibility,
    tags: record.tags,
    entryDigest: record.entryDigest,
    packageDigest: record.packageDigest,
    manifest: record.manifest,
    profile: {
      ...record.profile,
      ...(record.source.discovery ? { discovery: record.source.discovery } : {}),
    },
    invocation: record.invocation,
  };
}

export const agentGlobalSkillService = new AgentGlobalSkillService();
