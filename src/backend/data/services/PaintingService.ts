import { and, asc, desc, eq, getTableColumns, inArray, lt, lte, or, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import {
  fileEntryTable,
  type PaintingBoardRow,
  paintingBoardTable,
  type PaintingRow,
  paintingTable,
} from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { FileEntryId } from '@/shared/data/types/file';
import { createUniqueModelId, isUniqueModelId } from '@/shared/data/types/model';
import {
  PAINTING_BOARD_RECENT_LIMIT,
  type Painting,
  type PaintingBoard,
  type PaintingBoardSummary,
  type UpdatePaintingBoardDto,
} from '@/shared/data/types/painting';

import { computeNewOrderKey, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

const defaultLimit = 20;
const maxLimit = 100;
const boardTitleLength = 40;

type BoardCursor = { id: string; updatedAt: number };

export interface CreatePaintingInput {
  /** Grows this board; a new board titled after the request is created when omitted. */
  boardId?: string;
  brief?: string | null;
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
   * The gallery lists boards, most recently touched first. Each summary carries
   * the board's newest receipts — output-less ones included, since a running
   * generation is what the cover should show — so one request draws a page.
   */
  async listBoardsByCursor(
    params: { cursor?: string; limit?: number } = {},
  ): Promise<CursorPaginationResponse<PaintingBoardSummary>> {
    const limit = Math.min(Math.max(params.limit ?? defaultLimit, 1), maxLimit);
    const cursor = params.cursor ? decodeBoardCursor(params.cursor) : undefined;
    const afterCursor = cursor
      ? or(
          lt(paintingBoardTable.updatedAt, cursor.updatedAt),
          and(
            eq(paintingBoardTable.updatedAt, cursor.updatedAt),
            lt(paintingBoardTable.id, cursor.id),
          ),
        )
      : undefined;

    const rows = await this.db
      .select()
      .from(paintingBoardTable)
      .where(afterCursor)
      .orderBy(desc(paintingBoardTable.updatedAt), desc(paintingBoardTable.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    const boardIds = pageRows.map((row) => row.id);
    const counts = new Map<string, number>();
    const recent = new Map<string, Painting[]>();

    if (boardIds.length > 0) {
      const countRows = await this.db
        .select({ boardId: paintingTable.boardId, count: sql<number>`count(*)` })
        .from(paintingTable)
        .where(inArray(paintingTable.boardId, boardIds))
        .groupBy(paintingTable.boardId);
      for (const row of countRows) counts.set(row.boardId, Number(row.count));

      const ranked = this.db
        .select({
          ...getTableColumns(paintingTable),
          rank: sql<number>`row_number() over (partition by ${paintingTable.boardId} order by ${paintingTable.createdAt} desc, ${paintingTable.id} desc)`.as(
            'rank',
          ),
        })
        .from(paintingTable)
        .where(inArray(paintingTable.boardId, boardIds))
        .as('ranked');
      const recentRows = await this.db
        .select()
        .from(ranked)
        .where(lte(ranked.rank, PAINTING_BOARD_RECENT_LIMIT))
        .orderBy(asc(ranked.boardId), asc(ranked.rank));
      for (const { rank: _rank, ...row } of recentRows) {
        const paintings = recent.get(row.boardId) ?? [];
        paintings.push(rowToPainting(row));
        recent.set(row.boardId, paintings);
      }
    }

    return {
      items: pageRows.map((row) => ({
        board: rowToBoard(row),
        paintingCount: counts.get(row.id) ?? 0,
        recentPaintings: recent.get(row.id) ?? [],
      })),
      ...(rows.length > limit && last
        ? { nextCursor: encodeBoardCursor({ id: last.id, updatedAt: last.updatedAt }) }
        : {}),
    };
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

  /**
   * Writes the receipt onto its board (creating the board for a first
   * generation) and makes it the board's focus, since the screen follows the
   * new node. Rides the caller's write transaction (`withWriteTx` is not reentrant).
   */
  async createTx(tx: Database, input: CreatePaintingInput): Promise<Painting> {
    const inputFileIds = await assertFileEntriesExistTx(tx, input.inputFileIds ?? []);
    const boardId = input.boardId ?? (await createBoardTx(tx, input.brief || input.prompt)).id;
    const inserted = (await insertWithOrderKey(
      tx,
      paintingTable,
      {
        boardId,
        brief: normalizeBrief(input.brief, input.prompt),
        files: { input: inputFileIds, output: [] },
        modelId: normalizeModelId(input.providerId, input.modelId),
        prompt: input.prompt,
        providerId: input.providerId,
      },
      { pkColumn: paintingTable.id, position: 'first' },
    )) as PaintingRow;
    const [board] = await tx
      .update(paintingBoardTable)
      .set({ focusPaintingId: inserted.id, updatedAt: Date.now() })
      .where(eq(paintingBoardTable.id, boardId))
      .returning({ id: paintingBoardTable.id });
    if (!board) {
      throw DataApiErrorFactory.notFound('PaintingBoard', boardId);
    }

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
        brief: normalizeBrief(input.brief, input.prompt),
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

  async replaceOutputs(
    id: string,
    outputFileIds: readonly FileEntryId[],
    signal?: AbortSignal,
  ): Promise<Painting> {
    return this.dbService.withWriteTx(async (tx) => {
      signal?.throwIfAborted();
      const [painting] = await tx
        .select({ files: paintingTable.files, id: paintingTable.id })
        .from(paintingTable)
        .where(eq(paintingTable.id, id))
        .limit(1);
      if (!painting) {
        throw DataApiErrorFactory.notFound('Painting', id);
      }

      const outputs = await assertFileEntriesExistTx(tx, outputFileIds);
      signal?.throwIfAborted();
      const [updated] = await tx
        .update(paintingTable)
        .set({ files: { ...painting.files, output: outputs }, updatedAt: Date.now() })
        .where(eq(paintingTable.id, id))
        .returning();
      // Roll back if cancellation arrived while SQLite was writing the references.
      signal?.throwIfAborted();
      return rowToPainting(updated as PaintingRow);
    });
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
        .returning({ boardId: paintingTable.boardId, id: paintingTable.id });
      if (deleted.length !== uniqueIds.length) {
        throw DataApiErrorFactory.notFound(
          'Painting',
          uniqueIds.length === 1 ? uniqueIds[0] : 'one or more selected paintings',
        );
      }
      // A board exists to hold paintings; one left without any is unreachable.
      await tx
        .delete(paintingBoardTable)
        .where(
          and(
            inArray(paintingBoardTable.id, [...new Set(deleted.map((row) => row.boardId))]),
            sql`NOT EXISTS (SELECT 1 FROM ${paintingTable} WHERE ${paintingTable.boardId} = ${paintingBoardTable.id})`,
          ),
        );
    });
  }

  /** The painting whose outputs include this file; null when no painting produced it. */
  async findByOutputFile(fileEntryId: string): Promise<Painting | null> {
    const [row] = await this.db
      .select()
      .from(paintingTable)
      .where(
        sql`EXISTS (SELECT 1 FROM json_each(${paintingTable.files}, '$.output') WHERE value = ${fileEntryId})`,
      )
      .limit(1);
    return row ? rowToPainting(row) : null;
  }

  async getBoard(id: string): Promise<PaintingBoard> {
    const [row] = await this.db
      .select()
      .from(paintingBoardTable)
      .where(eq(paintingBoardTable.id, id))
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('PaintingBoard', id);
    }
    return rowToBoard(row);
  }

  /** Oldest first: generation order is the board's reading order. */
  async listByBoard(boardId: string): Promise<Painting[]> {
    const rows = await this.db
      .select()
      .from(paintingTable)
      .where(eq(paintingTable.boardId, boardId))
      .orderBy(asc(paintingTable.createdAt), asc(paintingTable.id));
    return rows.map(rowToPainting);
  }

  async updateBoard(id: string, update: UpdatePaintingBoardDto): Promise<PaintingBoard> {
    const title = update.title?.trim();
    if (update.title !== undefined && !title) {
      throw DataApiErrorFactory.validation({ title: ['Board title is required'] });
    }
    return this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .update(paintingBoardTable)
        .set({
          ...(title ? { title } : {}),
          ...(update.focusPaintingId !== undefined
            ? { focusPaintingId: update.focusPaintingId }
            : {}),
          updatedAt: Date.now(),
        })
        .where(eq(paintingBoardTable.id, id))
        .returning();
      if (!row) {
        throw DataApiErrorFactory.notFound('PaintingBoard', id);
      }
      return rowToBoard(row);
    });
  }

  /** Deleting the board cascades to its paintings; their image files stay in the library. */
  async deleteBoard(id: string): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const deleted = await tx
        .delete(paintingBoardTable)
        .where(eq(paintingBoardTable.id, id))
        .returning({ id: paintingBoardTable.id });
      if (deleted.length === 0) {
        throw DataApiErrorFactory.notFound('PaintingBoard', id);
      }
    });
  }
}

async function createBoardTx(tx: Database, request: string): Promise<PaintingBoardRow> {
  const [board] = await tx
    .insert(paintingBoardTable)
    .values({ title: boardTitle(request) })
    .returning();
  return board as PaintingBoardRow;
}

/** First line of the request, shortened; the user can rename the board later. */
function boardTitle(request: string): string {
  const firstLine = request.trim().split('\n')[0] ?? '';
  return [...firstLine].slice(0, boardTitleLength).join('').trim();
}

/** Stored only when it says something the model prompt does not. */
function normalizeBrief(brief: string | null | undefined, prompt: string): string | null {
  const trimmed = brief?.trim();
  return trimmed && trimmed !== prompt.trim() ? trimmed : null;
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

function rowToBoard(row: PaintingBoardRow): PaintingBoard {
  return {
    createdAt: timestampToISO(row.createdAt),
    focusPaintingId: row.focusPaintingId,
    id: row.id,
    title: row.title,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function rowToPainting(row: PaintingRow): Painting {
  return {
    boardId: row.boardId,
    brief: row.brief,
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

function encodeBoardCursor(cursor: BoardCursor): string {
  return JSON.stringify(cursor);
}

function decodeBoardCursor(value: string): BoardCursor {
  try {
    const parsed = JSON.parse(value) as Partial<BoardCursor>;
    if (typeof parsed.id !== 'string' || typeof parsed.updatedAt !== 'number') {
      throw new Error('Painting board cursor fields are invalid');
    }
    return { id: parsed.id, updatedAt: parsed.updatedAt };
  } catch (error) {
    throw DataApiErrorFactory.validation(
      { cursor: ['Invalid painting board cursor'] },
      error instanceof Error ? error.message : 'Invalid painting board cursor',
    );
  }
}

export const paintingService = new PaintingService();
