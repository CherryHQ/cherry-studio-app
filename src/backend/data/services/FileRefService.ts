import type {
  FileEntryId,
  FileRef,
  FileRefSourceType,
} from '@cherrystudio/universal/data/types/file';
import { allSourceTypes, FileRefSchema } from '@cherrystudio/universal/data/types/file';
import { asc, count, eq, inArray } from 'drizzle-orm';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { persistentFileRefTablesBySourceType } from '@/backend/data/db/schemas/fileRelations';

export type FileRefSourceKey = {
  readonly sourceId: string;
  readonly sourceType: FileRefSourceType;
};

const SQLITE_IN_ARRAY_CHUNK = 500;
type PersistentFileRefTable = (typeof persistentFileRefTablesBySourceType)[FileRefSourceType];

export class FileRefService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  async findByEntryId(fileEntryId: FileEntryId): Promise<FileRef[]> {
    const groups = await Promise.all(
      allSourceTypes.map((sourceType) =>
        this.findTableRefs(
          persistentFileRefTablesBySourceType[sourceType],
          sourceType,
          'fileEntryId',
          fileEntryId,
        ),
      ),
    );
    return groups.flat().sort(compareRefs);
  }

  async findBySource(source: FileRefSourceKey): Promise<FileRef[]> {
    return this.findTableRefs(
      persistentFileRefTablesBySourceType[source.sourceType],
      source.sourceType,
      'sourceId',
      source.sourceId,
    );
  }

  async countByEntryIds(ids: readonly FileEntryId[]): Promise<Map<FileEntryId, number>> {
    const counts = new Map<FileEntryId, number>();
    const addRows = (rows: { entryId: FileEntryId; refCount: number }[]) => {
      for (const row of rows) {
        counts.set(row.entryId, (counts.get(row.entryId) ?? 0) + row.refCount);
      }
    };

    for (let offset = 0; offset < ids.length; offset += SQLITE_IN_ARRAY_CHUNK) {
      const chunk = ids.slice(offset, offset + SQLITE_IN_ARRAY_CHUNK);
      const groups = await Promise.all(
        allSourceTypes.map((sourceType) =>
          this.countTableRefs(persistentFileRefTablesBySourceType[sourceType], chunk),
        ),
      );
      groups.forEach(addRows);
    }
    return counts;
  }

  async countPersistentRefsByEntryIdTx(tx: Database, id: FileEntryId): Promise<number> {
    let total = 0;
    for (const table of Object.values(persistentFileRefTablesBySourceType)) {
      const [row] = await tx
        .select({ value: count() })
        .from(table)
        .where(eq(table.fileEntryId, id));
      total += row?.value ?? 0;
    }
    return total;
  }

  private async findTableRefs(
    table: PersistentFileRefTable,
    sourceType: FileRefSourceType,
    column: 'fileEntryId' | 'sourceId',
    value: string,
  ): Promise<FileRef[]> {
    const rows = await this.db
      .select()
      .from(table)
      .where(eq(table[column], value))
      .orderBy(asc(table.createdAt), asc(table.id));
    return rows.map((row) => FileRefSchema.parse({ ...row, sourceType }));
  }

  private async countTableRefs(
    table: PersistentFileRefTable,
    ids: readonly FileEntryId[],
  ): Promise<{ entryId: FileEntryId; refCount: number }[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ entryId: table.fileEntryId, refCount: count() })
      .from(table)
      .where(inArray(table.fileEntryId, ids))
      .groupBy(table.fileEntryId);
  }
}

function compareRefs(left: FileRef, right: FileRef): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}
