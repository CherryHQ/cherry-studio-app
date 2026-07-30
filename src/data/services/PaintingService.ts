import { and, asc, eq, exists, gt, inArray, or } from 'drizzle-orm';

import type { Database, DbService } from '@/data/db/DbService';
import {
  fileEntryTable,
  type PaintingRow,
  paintingFileRefTable,
  paintingTable,
} from '@/data/db/schemas';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import { DataApiErrorFactory } from '@/shared/data/api/types';
import type { FileEntryId, PreparedInternalFile } from '@/shared/data/types/file';
import { createUniqueModelId, isUniqueModelId } from '@/shared/data/types/model';
import type { Painting, PaintingFileRole, PaintingFiles } from '@/shared/data/types/painting';

import type { FileEntryService } from './FileEntryService';
import { discardPreparedFiles } from './fileStorage';
import { insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

const defaultLimit = 20;
const maxLimit = 100;
const emptyFiles: PaintingFiles = { input: [], output: [] };

type PaintingCursor = { id: string; orderKey: string };

export interface CreatePaintingInput {
  inputFileIds?: readonly FileEntryId[];
  modelId?: string | null;
  preparedInputFiles?: readonly PreparedInternalFile[];
  prompt: string;
  providerId: string;
}

export class PaintingService {
  constructor(
    private readonly dbService: DbService,
    private readonly fileEntryService: FileEntryService,
  ) {}

  private get db() {
    return this.dbService.getDb();
  }

  private hasOutputFilter() {
    return exists(
      this.db
        .select({ id: paintingFileRefTable.id })
        .from(paintingFileRefTable)
        .where(
          and(
            eq(paintingFileRefTable.sourceId, paintingTable.id),
            eq(paintingFileRefTable.role, 'output'),
          ),
        ),
    );
  }

  async listByCursor(
    params: { cursor?: string; limit?: number } = {},
  ): Promise<CursorPaginationResponse<Painting>> {
    const limit = Math.min(Math.max(params.limit ?? defaultLimit, 1), maxLimit);
    const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
    const hasOutput = this.hasOutputFilter();
    const afterCursor = cursor
      ? or(
          gt(paintingTable.orderKey, cursor.orderKey),
          and(eq(paintingTable.orderKey, cursor.orderKey), gt(paintingTable.id, cursor.id)),
        )
      : undefined;

    const rows = await this.db
      .select()
      .from(paintingTable)
      .where(afterCursor ? and(hasOutput, afterCursor) : hasOutput)
      .orderBy(asc(paintingTable.orderKey), asc(paintingTable.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const files = await this.loadFiles(pageRows.map((row) => row.id));
    const last = pageRows.at(-1);

    return {
      items: pageRows.map((row) => rowToPainting(row, files.get(row.id) ?? emptyFiles)),
      ...(rows.length > limit && last
        ? { nextCursor: encodeCursor({ id: last.id, orderKey: last.orderKey }) }
        : {}),
    };
  }

  async listAllIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: paintingTable.id })
      .from(paintingTable)
      .where(this.hasOutputFilter())
      .orderBy(asc(paintingTable.orderKey), asc(paintingTable.id));
    return rows.map((row) => row.id);
  }

  async getById(id: string): Promise<Painting> {
    const [row] = await this.db
      .select()
      .from(paintingTable)
      .where(eq(paintingTable.id, id))
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('Painting', id);
    }

    const files = await this.loadFiles([id]);
    return rowToPainting(row, files.get(id) ?? emptyFiles);
  }

  async create(input: CreatePaintingInput): Promise<Painting> {
    const preparedFiles = [...(input.preparedInputFiles ?? [])];

    try {
      const row = (await this.dbService.withWriteTx(async (tx) => {
        await this.fileEntryService.createPreparedEntriesTx(tx, preparedFiles);
        const inserted = (await insertWithOrderKey(
          tx,
          paintingTable,
          {
            modelId: normalizeModelId(input.providerId, input.modelId),
            prompt: input.prompt,
            providerId: input.providerId,
          },
          { pkColumn: paintingTable.id, position: 'first' },
        )) as PaintingRow;
        await insertFileRefsTx(tx, inserted.id, 'input', [
          ...(input.inputFileIds ?? []),
          ...preparedFiles.map((file) => file.id),
        ]);
        return inserted;
      })) as PaintingRow;

      return rowToPainting(row, {
        input: [...(input.inputFileIds ?? []), ...preparedFiles.map((file) => file.id)],
        output: [],
      });
    } catch (error) {
      discardPreparedFiles(preparedFiles);
      throw error;
    }
  }

  async replaceOutputs(
    id: string,
    preparedOutputs: readonly PreparedInternalFile[],
  ): Promise<Painting> {
    const outputs = [...preparedOutputs];

    try {
      await this.dbService.withWriteTx(async (tx) => {
        const [painting] = await tx
          .select({ id: paintingTable.id })
          .from(paintingTable)
          .where(eq(paintingTable.id, id))
          .limit(1);
        if (!painting) {
          throw DataApiErrorFactory.notFound('Painting', id);
        }

        await this.fileEntryService.createPreparedEntriesTx(tx, outputs);
        await tx
          .delete(paintingFileRefTable)
          .where(
            and(eq(paintingFileRefTable.sourceId, id), eq(paintingFileRefTable.role, 'output')),
          );
        await insertFileRefsTx(
          tx,
          id,
          'output',
          outputs.map((file) => file.id),
        );
        await tx
          .update(paintingTable)
          .set({ updatedAt: Date.now() })
          .where(eq(paintingTable.id, id));
      });
    } catch (error) {
      discardPreparedFiles(outputs);
      throw error;
    }

    return await this.getById(id);
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    await this.dbService.withWriteTx(async (tx) => {
      const deleted = await tx
        .delete(paintingTable)
        .where(inArray(paintingTable.id, uniqueIds))
        .returning({ id: paintingTable.id });
      if (deleted.length !== uniqueIds.length) {
        throw DataApiErrorFactory.notFound(
          'Painting',
          uniqueIds.length === 1 ? uniqueIds[0] : 'one or more selected paintings',
        );
      }
    });
  }

  private async loadFiles(ids: readonly string[]): Promise<Map<string, PaintingFiles>> {
    return loadFilesTx(this.db, ids);
  }
}

async function insertFileRefsTx(
  tx: Database,
  paintingId: string,
  role: PaintingFileRole,
  fileEntryIds: readonly FileEntryId[],
): Promise<void> {
  const uniqueIds = [...new Set(fileEntryIds)];
  if (uniqueIds.length === 0) {
    return;
  }

  const existing = await tx
    .select({ id: fileEntryTable.id })
    .from(fileEntryTable)
    .where(inArray(fileEntryTable.id, uniqueIds));
  if (existing.length !== uniqueIds.length) {
    throw DataApiErrorFactory.notFound('FileEntry', 'one or more painting files');
  }

  await tx.insert(paintingFileRefTable).values(
    uniqueIds.map((fileEntryId) => ({
      fileEntryId,
      role,
      sourceId: paintingId,
    })),
  );
}

async function loadFilesTx(
  tx: Database,
  paintingIds: readonly string[],
): Promise<Map<string, PaintingFiles>> {
  if (paintingIds.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select({
      fileEntryId: paintingFileRefTable.fileEntryId,
      role: paintingFileRefTable.role,
      sourceId: paintingFileRefTable.sourceId,
    })
    .from(paintingFileRefTable)
    .where(inArray(paintingFileRefTable.sourceId, paintingIds))
    .orderBy(asc(paintingFileRefTable.createdAt), asc(paintingFileRefTable.id));
  const result = new Map<string, PaintingFiles>();
  for (const row of rows) {
    const files = result.get(row.sourceId) ?? { input: [], output: [] };
    files[row.role].push(row.fileEntryId);
    result.set(row.sourceId, files);
  }
  return result;
}

function normalizeModelId(providerId: string, modelId: string | null | undefined): string | null {
  if (!modelId) {
    return null;
  }
  return isUniqueModelId(modelId) ? modelId : createUniqueModelId(providerId, modelId);
}

function rowToPainting(row: PaintingRow, files: PaintingFiles): Painting {
  return {
    createdAt: timestampToISO(row.createdAt),
    files,
    id: row.id,
    modelId: row.modelId,
    orderKey: row.orderKey,
    prompt: row.prompt,
    providerId: row.providerId,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function encodeCursor(cursor: PaintingCursor): string {
  return JSON.stringify(cursor);
}

function decodeCursor(value: string): PaintingCursor {
  try {
    const parsed = JSON.parse(value) as Partial<PaintingCursor>;
    if (typeof parsed.id !== 'string' || typeof parsed.orderKey !== 'string') {
      throw new Error('Painting cursor fields are invalid');
    }
    return { id: parsed.id, orderKey: parsed.orderKey };
  } catch (error) {
    throw DataApiErrorFactory.validation(
      { cursor: ['Invalid painting cursor'] },
      error instanceof Error ? error.message : 'Invalid painting cursor',
    );
  }
}
