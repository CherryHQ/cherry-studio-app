import { and, asc, eq, inArray, not, sql } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { type NoteRow, noteTable } from '@/backend/data/db/schemas/note';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type {
  DeleteNoteQuery,
  RewriteNotePathDto,
  UpsertNoteDto,
} from '@/shared/data/api/schemas/notes';
import type { Note } from '@/shared/data/types/note';

import { timestampToISO } from './utils/rowMappers';

function rowToNote(row: NoteRow): Note {
  return {
    createdAt: timestampToISO(row.createdAt),
    id: row.id,
    isExpanded: row.isExpanded,
    isStarred: row.isStarred,
    path: row.path,
    rootPath: row.rootPath,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function pathCondition(path: string, recursive = false) {
  if (!recursive) {
    return eq(noteTable.path, path);
  }
  const prefix = `${path}/`;
  return sql`(${noteTable.path} = ${path} OR substr(${noteTable.path}, 1, length(${prefix})) = ${prefix})`;
}

export class NoteService {
  constructor(private readonly dbService: DbService) {}

  async listByRoot(rootPath: string): Promise<Note[]> {
    const rows = await this.dbService
      .getDb()
      .select()
      .from(noteTable)
      .where(eq(noteTable.rootPath, rootPath))
      .orderBy(asc(noteTable.path));
    return rows.map(rowToNote);
  }

  async upsert(dto: UpsertNoteDto): Promise<Note | null> {
    const updateValues: Partial<Pick<NoteRow, 'isExpanded' | 'isStarred'>> = {};
    if (dto.isStarred !== undefined) updateValues.isStarred = dto.isStarred;
    if (dto.isExpanded !== undefined) updateValues.isExpanded = dto.isExpanded;
    if (Object.keys(updateValues).length === 0) {
      throw DataApiErrorFactory.validation({ note: ['At least one note field is required'] });
    }
    if (dto.isStarred === false && dto.isExpanded === false) {
      await this.deleteByPath({ path: dto.path, rootPath: dto.rootPath });
      return null;
    }

    const row = await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(noteTable)
        .where(and(eq(noteTable.rootPath, dto.rootPath), eq(noteTable.path, dto.path)))
        .limit(1);
      const isStarred = dto.isStarred ?? existing?.isStarred ?? false;
      const isExpanded = dto.isExpanded ?? existing?.isExpanded ?? false;

      if (!isStarred && !isExpanded) {
        if (existing) await tx.delete(noteTable).where(eq(noteTable.id, existing.id));
        return null;
      }
      if (existing) {
        const [updated] = await tx
          .update(noteTable)
          .set(updateValues)
          .where(eq(noteTable.id, existing.id))
          .returning();
        return updated ?? null;
      }
      const [inserted] = await tx
        .insert(noteTable)
        .values({ isExpanded, isStarred, path: dto.path, rootPath: dto.rootPath })
        .returning();
      return inserted ?? null;
    });

    return row ? rowToNote(row) : null;
  }

  async deleteByPath(query: DeleteNoteQuery): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      tx
        .delete(noteTable)
        .where(
          and(
            eq(noteTable.rootPath, query.rootPath),
            pathCondition(query.path, query.recursive ?? false),
          ),
        ),
    );
  }

  async rewritePath(dto: RewriteNotePathDto): Promise<{ updated: number }> {
    return this.dbService.withWriteTx(async (tx) => {
      const rows = await tx
        .select()
        .from(noteTable)
        .where(
          and(
            eq(noteTable.rootPath, dto.rootPath),
            pathCondition(dto.fromPath, dto.recursive ?? false),
          ),
        );
      if (rows.length === 0) return { updated: 0 };

      const rewrites = rows.map((row) => ({
        id: row.id,
        path:
          row.path === dto.fromPath
            ? dto.toPath
            : `${dto.toPath}${row.path.slice(dto.fromPath.length)}`,
      }));
      const sourceIds = rewrites.map(({ id }) => id);
      const targetPaths = [...new Set(rewrites.map(({ path }) => path))];
      await tx
        .delete(noteTable)
        .where(
          and(
            eq(noteTable.rootPath, dto.rootPath),
            inArray(noteTable.path, targetPaths),
            not(inArray(noteTable.id, sourceIds)),
          ),
        );
      const pathCase = sql<string>`CASE ${noteTable.id} ${sql.join(
        rewrites.map((rewrite) => sql`WHEN ${rewrite.id} THEN ${rewrite.path}`),
        sql` `,
      )} ELSE ${noteTable.path} END`;
      await tx.update(noteTable).set({ path: pathCase }).where(inArray(noteTable.id, sourceIds));
      return { updated: rows.length };
    });
  }
}
