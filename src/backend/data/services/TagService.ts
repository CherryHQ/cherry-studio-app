import type { SetTagEntitiesDto } from '@cherrystudio/universal/data/api/schemas/tags';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/types';
import type { EntityType } from '@cherrystudio/universal/data/types/entityType';
import type {
  CreateTagDto,
  SyncEntityTagsDto,
  Tag,
  UpdateTagDto,
} from '@cherrystudio/universal/data/types/tag';
import { and, asc, eq, inArray, or, type SQL } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { entityTagTable, tagTable } from '@/backend/data/db/schemas';
import type { TagRow } from '@/backend/data/db/schemas/tagging';

import { timestampToISO } from './utils/rowMappers';

type TxLike = any;
type EntityBinding = SetTagEntitiesDto['entities'][number];

function entityBindingKey(entity: { entityId: string; entityType: string }): string {
  return `${entity.entityType}:${entity.entityId}`;
}

function dedupeEntityBindings(entities: EntityBinding[]): EntityBinding[] {
  const uniqueEntities = new Map<string, EntityBinding>();
  for (const entity of entities) {
    const key = entityBindingKey(entity);
    if (!uniqueEntities.has(key)) {
      uniqueEntities.set(key, entity);
    }
  }
  return [...uniqueEntities.values()];
}

function buildEntityBindingCondition(
  entities: { entityId: string; entityType: string }[],
): SQL | undefined {
  const conditions = entities.map((entity) =>
    and(
      eq(entityTagTable.entityType, entity.entityType),
      eq(entityTagTable.entityId, entity.entityId),
    ),
  );
  if (conditions.length === 0) {
    return undefined;
  }
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

function rowToTag(row: TagRow): Tag {
  return {
    color: row.color ?? null,
    createdAt: timestampToISO(row.createdAt),
    id: row.id,
    name: row.name,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class TagService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async list(): Promise<Tag[]> {
    const rows = await this.db.select().from(tagTable).orderBy(asc(tagTable.name));
    return rows.map(rowToTag);
  }

  async getById(id: string): Promise<Tag> {
    const [row] = await this.db.select().from(tagTable).where(eq(tagTable.id, id)).limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('Tag', id);
    }

    return rowToTag(row);
  }

  async create(dto: CreateTagDto): Promise<Tag> {
    await this.assertNameAvailable(dto.name);

    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .insert(tagTable)
        .values({ color: dto.color ?? null, name: dto.name })
        .returning(),
    );

    return rowToTag(row);
  }

  async update(id: string, dto: UpdateTagDto): Promise<Tag> {
    const updates: Partial<typeof tagTable.$inferInsert> = {};

    if (dto.name !== undefined) {
      await this.assertNameAvailable(dto.name, id);
      updates.name = dto.name;
    }
    if (dto.color !== undefined) {
      updates.color = dto.color;
    }

    if (Object.keys(updates).length === 0) {
      return this.getById(id);
    }

    const [row] = await this.dbService.withWriteTx((tx) =>
      tx.update(tagTable).set(updates).where(eq(tagTable.id, id)).returning(),
    );

    if (!row) {
      throw DataApiErrorFactory.notFound('Tag', id);
    }

    return rowToTag(row);
  }

  async delete(id: string): Promise<void> {
    const [row] = await this.dbService.withWriteTx((tx) => {
      return tx.delete(tagTable).where(eq(tagTable.id, id)).returning({
        id: tagTable.id,
      });
    });

    if (!row) {
      throw DataApiErrorFactory.notFound('Tag', id);
    }
  }

  async getTagsByEntity(entityType: EntityType, entityId: string): Promise<Tag[]> {
    const rows = await this.db
      .select({
        color: tagTable.color,
        createdAt: tagTable.createdAt,
        id: tagTable.id,
        name: tagTable.name,
        updatedAt: tagTable.updatedAt,
      })
      .from(entityTagTable)
      .innerJoin(tagTable, eq(entityTagTable.tagId, tagTable.id))
      .where(and(eq(entityTagTable.entityType, entityType), eq(entityTagTable.entityId, entityId)))
      .orderBy(asc(tagTable.name));

    return rows.map(rowToTag);
  }

  async setEntities(tagId: string, dto: SetTagEntitiesDto): Promise<void> {
    const desiredEntities = dedupeEntityBindings(dto.entities);

    await this.dbService.withWriteTx(async (tx) => {
      const [tag] = await tx
        .select({ id: tagTable.id })
        .from(tagTable)
        .where(eq(tagTable.id, tagId))
        .limit(1);
      if (!tag) {
        throw DataApiErrorFactory.notFound('Tag', tagId);
      }

      const existing = await tx
        .select({ entityId: entityTagTable.entityId, entityType: entityTagTable.entityType })
        .from(entityTagTable)
        .where(eq(entityTagTable.tagId, tagId));
      const existingKeys = new Set(existing.map(entityBindingKey));
      const desiredKeys = new Set(desiredEntities.map(entityBindingKey));
      const toRemove = existing.filter((entity) => !desiredKeys.has(entityBindingKey(entity)));
      const toAdd = desiredEntities.filter((entity) => !existingKeys.has(entityBindingKey(entity)));

      const deleteCondition = buildEntityBindingCondition(toRemove);
      if (deleteCondition) {
        await tx
          .delete(entityTagTable)
          .where(and(eq(entityTagTable.tagId, tagId), deleteCondition));
      }

      if (toAdd.length > 0) {
        await tx.insert(entityTagTable).values(
          toAdd.map((entity) => ({
            entityId: entity.entityId,
            entityType: entity.entityType,
            tagId,
          })),
        );
      }
    });
  }

  async getTagsByEntitiesTx(
    tx: TxLike,
    entityType: EntityType,
    entityIds: string[],
  ): Promise<Map<string, Tag[]>> {
    const result = new Map<string, Tag[]>();
    const uniqueEntityIds = [...new Set(entityIds)];

    for (const entityId of uniqueEntityIds) {
      result.set(entityId, []);
    }

    if (uniqueEntityIds.length === 0) {
      return result;
    }

    const rows = await tx
      .select({
        color: tagTable.color,
        createdAt: tagTable.createdAt,
        entityId: entityTagTable.entityId,
        id: tagTable.id,
        name: tagTable.name,
        updatedAt: tagTable.updatedAt,
      })
      .from(entityTagTable)
      .innerJoin(tagTable, eq(entityTagTable.tagId, tagTable.id))
      .where(
        and(
          eq(entityTagTable.entityType, entityType),
          inArray(entityTagTable.entityId, uniqueEntityIds),
        ),
      )
      .orderBy(asc(entityTagTable.entityId), asc(tagTable.name));

    for (const row of rows) {
      result.get(row.entityId)?.push(rowToTag(row));
    }

    return result;
  }

  async getEntityIdsByTagsTx(
    tx: TxLike,
    entityType: EntityType,
    tagIds: string[],
  ): Promise<string[]> {
    const uniqueTagIds = [...new Set(tagIds)];
    if (uniqueTagIds.length === 0) {
      return [];
    }

    const rows = (await tx
      .select({ entityId: entityTagTable.entityId })
      .from(entityTagTable)
      .where(
        and(eq(entityTagTable.entityType, entityType), inArray(entityTagTable.tagId, uniqueTagIds)),
      )) as {
      entityId: string;
    }[];

    return [...new Set(rows.map((row) => row.entityId))];
  }

  async syncEntityTags(
    entityType: EntityType,
    entityId: string,
    dto: SyncEntityTagsDto,
  ): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      this.syncEntityTagsTx(tx, entityType, entityId, dto.tagIds),
    );
  }

  async syncEntityTagsTx(
    tx: TxLike,
    entityType: EntityType,
    entityId: string,
    tagIds: string[],
  ): Promise<void> {
    const desiredTagIds = [...new Set(tagIds)];
    const existing = await tx
      .select({ tagId: entityTagTable.tagId })
      .from(entityTagTable)
      .where(and(eq(entityTagTable.entityType, entityType), eq(entityTagTable.entityId, entityId)));

    const existingIds = new Set(existing.map((row: { tagId: string }) => row.tagId));
    const desiredIds = new Set(desiredTagIds);
    const toRemove = existing.flatMap((row: { tagId: string }) =>
      desiredIds.has(row.tagId) ? [] : [row.tagId],
    );
    const toAdd = desiredTagIds.filter((tagId) => !existingIds.has(tagId));

    if (toRemove.length > 0) {
      await tx
        .delete(entityTagTable)
        .where(
          and(
            eq(entityTagTable.entityType, entityType),
            eq(entityTagTable.entityId, entityId),
            inArray(entityTagTable.tagId, toRemove),
          ),
        );
    }

    if (toAdd.length > 0) {
      await this.assertTagsExistTx(tx, toAdd);
      await tx
        .insert(entityTagTable)
        .values(toAdd.map((tagId) => ({ entityId, entityType, tagId })));
    }
  }

  async purgeForEntityTx(tx: TxLike, entityType: EntityType, entityId: string): Promise<void> {
    await tx
      .delete(entityTagTable)
      .where(and(eq(entityTagTable.entityType, entityType), eq(entityTagTable.entityId, entityId)));
  }

  async purgeForEntitiesTx(tx: TxLike, entityType: EntityType, entityIds: string[]): Promise<void> {
    const uniqueEntityIds = [...new Set(entityIds)];
    if (uniqueEntityIds.length === 0) {
      return;
    }

    await tx
      .delete(entityTagTable)
      .where(
        and(
          eq(entityTagTable.entityType, entityType),
          inArray(entityTagTable.entityId, uniqueEntityIds),
        ),
      );
  }

  private async assertNameAvailable(name: string, currentId?: string): Promise<void> {
    const [row] = await this.db
      .select({ id: tagTable.id })
      .from(tagTable)
      .where(eq(tagTable.name, name))
      .limit(1);

    if (row && row.id !== currentId) {
      throw DataApiErrorFactory.conflict(`Tag with name '${name}' already exists`, 'Tag');
    }
  }

  private async assertTagsExistTx(tx: TxLike, tagIds: string[]): Promise<void> {
    const uniqueTagIds = [...new Set(tagIds)];
    if (uniqueTagIds.length === 0) {
      return;
    }

    const rows = await tx
      .select({ id: tagTable.id })
      .from(tagTable)
      .where(inArray(tagTable.id, uniqueTagIds));
    const existingIds = new Set(rows.map((row: { id: string }) => row.id));
    const missing = uniqueTagIds.filter((tagId) => !existingIds.has(tagId));

    if (missing.length > 0) {
      throw DataApiErrorFactory.notFound('Tag', missing.join(', '));
    }
  }
}

export const tagService = new TagService();
