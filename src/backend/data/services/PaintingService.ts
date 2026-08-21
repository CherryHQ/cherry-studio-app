import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import { fileEntryTable, type PaintingRow, paintingTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { FileEntryId } from '@/shared/data/types/file';
import { createUniqueModelId, isUniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

import { computeNewOrderKey, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

const defaultLimit = 20;
const maxLimit = 100;

type PaintingCursor = { id: string; orderKey: string };

export interface CreatePaintingInput {
  inputFileIds?: readonly FileEntryId[];
  modelId?: string | null;
  prompt: string;
  providerId: string;
}

export class PaintingService {
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
    const last = pageRows.at(-1);

    return {
      items: pageRows.map(rowToPainting),
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

    return rowToPainting(row);
  }

  async create(input: CreatePaintingInput): Promise<Painting> {
    return this.dbService.withWriteTx((tx) => this.createTx(tx, input));
  }

  /** Rides the caller's write transaction (`withWriteTx` is not reentrant). */
  async createTx(tx: Database, input: CreatePaintingInput): Promise<Painting> {
    const inputFileIds = await assertFileEntriesExistTx(tx, input.inputFileIds ?? []);
    const inserted = (await insertWithOrderKey(
      tx,
      paintingTable,
      {
        files: { input: inputFileIds, output: [] },
        modelId: normalizeModelId(input.providerId, input.modelId),
        prompt: input.prompt,
        providerId: input.providerId,
      },
      { pkColumn: paintingTable.id, position: 'first' },
    )) as PaintingRow;

    return rowToPainting(inserted);
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
      .select({ files: paintingTable.files, id: paintingTable.id })
      .from(paintingTable)
      .where(eq(paintingTable.id, id))
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('Painting', id);
    }

    if (row.files.output.length > 0) {
      // Reuse would drop finished images on the floor. Callers are meant to
      // gate on the interrupted state (zero outputs); getting here means the
      // caller mistook a finished painting for one worth retrying.
      throw DataApiErrorFactory.validation(
        { paintingId: ['Painting already has outputs'] },
        `Painting ${id} already has outputs and cannot be reused for a retry`,
      );
    }

    const inputFileIds = await assertFileEntriesExistTx(tx, input.inputFileIds ?? []);
    const orderKey = await computeNewOrderKey(
      tx,
      paintingTable,
      { position: 'first' },
      { excludePkValue: id, pkColumn: paintingTable.id },
    );
    const [updated] = await tx
      .update(paintingTable)
      .set({
        files: { input: inputFileIds, output: [] },
        modelId: normalizeModelId(input.providerId, input.modelId),
        orderKey,
        prompt: input.prompt,
        providerId: input.providerId,
        updatedAt: Date.now(),
      })
      .where(eq(paintingTable.id, id))
      .returning();

    return rowToPainting(updated as PaintingRow);
  }

  async replaceOutputs(id: string, outputFileIds: readonly FileEntryId[]): Promise<Painting> {
    await this.dbService.withWriteTx(async (tx) => {
      const [painting] = await tx
        .select({ files: paintingTable.files, id: paintingTable.id })
        .from(paintingTable)
        .where(eq(paintingTable.id, id))
        .limit(1);
      if (!painting) {
        throw DataApiErrorFactory.notFound('Painting', id);
      }

      const outputs = await assertFileEntriesExistTx(tx, outputFileIds);
      await tx
        .update(paintingTable)
        .set({ files: { ...painting.files, output: outputs }, updatedAt: Date.now() })
        .where(eq(paintingTable.id, id));
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
}

/** Deduplicates the ids and fails the write if any of them has no `file_entry` row. */
async function assertFileEntriesExistTx(
  tx: Database,
  fileEntryIds: readonly FileEntryId[],
): Promise<FileEntryId[]> {
  const uniqueIds = [...new Set(fileEntryIds)];
  if (uniqueIds.length === 0) {
    return [];
  }

  const existing = await tx
    .select({ id: fileEntryTable.id })
    .from(fileEntryTable)
    .where(inArray(fileEntryTable.id, uniqueIds));
  if (existing.length !== uniqueIds.length) {
    throw DataApiErrorFactory.notFound('FileEntry', 'one or more painting files');
  }

  return uniqueIds;
}

function normalizeModelId(providerId: string, modelId: string | null | undefined): string | null {
  if (!modelId) {
    return null;
  }
  return isUniqueModelId(modelId) ? modelId : createUniqueModelId(providerId, modelId);
}

function rowToPainting(row: PaintingRow): Painting {
  return {
    createdAt: timestampToISO(row.createdAt),
    files: row.files,
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

export const paintingService = new PaintingService();
