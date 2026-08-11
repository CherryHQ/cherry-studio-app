import type { CursorPaginationResponse } from '@cherrystudio/universal/data/api/types';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/types';
import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import { createUniqueModelId, isUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type {
  Painting,
  PaintingFileRole,
  PaintingFiles,
} from '@cherrystudio/universal/data/types/painting';
import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';

import type { Database, DbService } from '@/backend/data/db/DbService';
import {
  fileEntryTable,
  type PaintingRow,
  paintingFileRefTable,
  paintingTable,
} from '@/backend/data/db/schemas';

import { computeNewOrderKey, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

const defaultLimit = 20;
const maxLimit = 100;
const emptyFiles: PaintingFiles = { input: [], output: [] };

type PaintingCursor = { id: string; orderKey: string };

export interface CreatePaintingInput {
  inputFileIds?: readonly FileEntryId[];
  modelId?: string | null;
  prompt: string;
  providerId: string;
}

export class PaintingService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  /**
   * Output-less receipts are listed too: while `painting.generate` runs (or
   * after it was interrupted) the row is all the gallery has to show, and
   * hiding it would leave the user with no way back to a running generation
   * and no way to delete an abandoned one.
   */
  async listByCursor(
    params: { cursor?: string; limit?: number } = {},
  ): Promise<CursorPaginationResponse<Painting>> {
    const limit = Math.min(Math.max(params.limit ?? defaultLimit, 1), maxLimit);
    const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
    const afterCursor = cursor
      ? or(
          gt(paintingTable.orderKey, cursor.orderKey),
          and(eq(paintingTable.orderKey, cursor.orderKey), gt(paintingTable.id, cursor.id)),
        )
      : undefined;

    const rows = await this.db
      .select()
      .from(paintingTable)
      .where(afterCursor)
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
    return this.dbService.withWriteTx((tx) => this.createTx(tx, input));
  }

  /** Rides the caller's write transaction (`withWriteTx` is not reentrant). */
  async createTx(tx: Database, input: CreatePaintingInput): Promise<Painting> {
    const inputFileIds = [...(input.inputFileIds ?? [])];
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
    await insertFileRefsTx(tx, inserted.id, 'input', inputFileIds);

    return rowToPainting(inserted, { input: inputFileIds, output: [] });
  }

  /**
   * Re-points an interrupted receipt at a fresh attempt: new prompt/model, new
   * input refs, back to the head of the list. A retry is another attempt at the
   * same painting rather than a new one, so reusing the row keeps its gallery
   * tile in place instead of stranding the interrupted one beside it.
   *
   * Rides the caller's write transaction (`withWriteTx` is not reentrant).
   */
  async resetForRetryTx(tx: Database, id: string, input: CreatePaintingInput): Promise<Painting> {
    const [row] = await tx
      .select({ id: paintingTable.id })
      .from(paintingTable)
      .where(eq(paintingTable.id, id))
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('Painting', id);
    }

    const existingFiles = await loadFilesTx(tx, [id]);
    if ((existingFiles.get(id)?.output.length ?? 0) > 0) {
      // Reuse would drop finished images on the floor. Callers are meant to
      // gate on the interrupted state (zero outputs); getting here means the
      // caller mistook a finished painting for one worth retrying.
      throw DataApiErrorFactory.validation(
        { paintingId: ['Painting already has outputs'] },
        `Painting ${id} already has outputs and cannot be reused for a retry`,
      );
    }

    const inputFileIds = [...(input.inputFileIds ?? [])];
    const orderKey = await computeNewOrderKey(
      tx,
      paintingTable,
      { position: 'first' },
      { excludePkValue: id, pkColumn: paintingTable.id },
    );
    await tx
      .delete(paintingFileRefTable)
      .where(and(eq(paintingFileRefTable.sourceId, id), eq(paintingFileRefTable.role, 'input')));
    await insertFileRefsTx(tx, id, 'input', inputFileIds);
    const [updated] = await tx
      .update(paintingTable)
      .set({
        modelId: normalizeModelId(input.providerId, input.modelId),
        orderKey,
        prompt: input.prompt,
        providerId: input.providerId,
        updatedAt: Date.now(),
      })
      .where(eq(paintingTable.id, id))
      .returning();

    return rowToPainting(updated as PaintingRow, { input: inputFileIds, output: [] });
  }

  async replaceOutputs(id: string, outputFileIds: readonly FileEntryId[]): Promise<Painting> {
    await this.dbService.withWriteTx(async (tx) => {
      const [painting] = await tx
        .select({ id: paintingTable.id })
        .from(paintingTable)
        .where(eq(paintingTable.id, id))
        .limit(1);
      if (!painting) {
        throw DataApiErrorFactory.notFound('Painting', id);
      }

      await tx
        .delete(paintingFileRefTable)
        .where(and(eq(paintingFileRefTable.sourceId, id), eq(paintingFileRefTable.role, 'output')));
      await insertFileRefsTx(tx, id, 'output', outputFileIds);
      await tx.update(paintingTable).set({ updatedAt: Date.now() }).where(eq(paintingTable.id, id));
    });

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
