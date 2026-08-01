import { and, asc, desc, eq, gt, inArray, lt, ne } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import {
  type InsertMiniAppRow,
  type MiniAppRow,
  miniAppTable,
} from '@/backend/data/db/schemas/miniApp';
import { DataApiErrorFactory } from '@cherrystudio/shared/data/api/errors';
import type { OrderRequest } from '@cherrystudio/shared/data/api/schemas/_endpointHelpers';
import type {
  CreateMiniAppDto,
  UpdateMiniAppDto,
} from '@cherrystudio/shared/data/api/schemas/miniApps';
import { PRESETS_MINI_APPS } from '@cherrystudio/shared/data/presets/miniApps';
import type { MiniApp, MiniAppId, MiniAppStatus } from '@cherrystudio/shared/data/types/miniApp';

import { applyMoves, generateOrderKeyBetween, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

const presetIds = new Set(PRESETS_MINI_APPS.map(({ id }) => id));
const visibleStatusValues = ['enabled', 'pinned'] as const satisfies readonly MiniAppStatus[];
const visibleStatuses = new Set<MiniAppStatus>(visibleStatusValues);

function isVisible(status: MiniAppStatus): boolean {
  return visibleStatuses.has(status);
}

function scopeFor(status: MiniAppStatus) {
  return isVisible(status)
    ? inArray(miniAppTable.status, [...visibleStatusValues])
    : eq(miniAppTable.status, status);
}

function rowToMiniApp(row: MiniAppRow): MiniApp {
  return {
    appId: row.appId as MiniAppId,
    background: row.background ?? undefined,
    bordered: row.bordered,
    configuration: row.configuration ?? undefined,
    createdAt: timestampToISO(row.createdAt),
    logo: row.logoKey ?? undefined,
    name: row.name,
    nameKey: row.nameKey ?? undefined,
    orderKey: row.orderKey,
    presetMiniAppId: row.presetMiniAppId,
    status: row.status,
    supportedRegions: row.supportedRegions ?? undefined,
    updatedAt: timestampToISO(row.updatedAt),
    url: row.url,
  };
}

export class MiniAppService {
  constructor(private readonly dbService: DbService) {}

  async getByAppId(appId: string): Promise<MiniApp> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(miniAppTable)
      .where(eq(miniAppTable.appId, appId))
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('MiniApp', appId);
    return rowToMiniApp(row);
  }

  async list(query: { status?: MiniAppStatus } = {}): Promise<MiniApp[]> {
    const rows = await this.dbService
      .getDb()
      .select()
      .from(miniAppTable)
      .where(query.status === undefined ? undefined : eq(miniAppTable.status, query.status))
      .orderBy(asc(miniAppTable.orderKey));
    return rows.map(rowToMiniApp).sort((left, right) => {
      const rank = (status: MiniAppStatus) =>
        status === 'pinned' ? 0 : status === 'enabled' ? 1 : 2;
      return rank(left.status) - rank(right.status) || left.orderKey.localeCompare(right.orderKey);
    });
  }

  async create(dto: CreateMiniAppDto): Promise<MiniApp> {
    if (presetIds.has(dto.appId)) {
      throw DataApiErrorFactory.conflict(
        `MiniApp with appId "${dto.appId}" is a preset app and cannot be recreated`,
      );
    }
    const row = (await this.dbService.withWriteTx((tx) =>
      insertWithOrderKey(
        tx,
        miniAppTable,
        {
          appId: dto.appId,
          logoKey: dto.logo?.key ?? null,
          name: dto.name,
          presetMiniAppId: null,
          status: 'enabled',
          url: dto.url,
        },
        { pkColumn: miniAppTable.appId, position: 'last', scope: scopeFor('enabled') },
      ),
    )) as MiniAppRow;
    return rowToMiniApp(row);
  }

  async update(appId: string, dto: UpdateMiniAppDto): Promise<MiniApp> {
    const hasCustomUpdate = dto.name !== undefined || dto.url !== undefined;
    if (dto.status === undefined && !hasCustomUpdate) {
      throw DataApiErrorFactory.validation(
        { _root: [`No updatable fields provided for "${appId}"`] },
        'No applicable fields to update',
      );
    }

    return this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(miniAppTable)
        .where(eq(miniAppTable.appId, appId))
        .limit(1);
      if (!existing) throw DataApiErrorFactory.notFound('MiniApp', appId);
      if (hasCustomUpdate && existing.presetMiniAppId !== null) {
        throw DataApiErrorFactory.invalidOperation(
          `update miniapp ${appId}`,
          'preset-derived miniapp user-facing fields cannot be edited',
        );
      }

      const updates: Partial<InsertMiniAppRow> = {};
      if (dto.name !== undefined) updates.name = dto.name;
      if (dto.url !== undefined) updates.url = dto.url;
      if (dto.status !== undefined) {
        updates.status = dto.status;
        if (dto.status !== existing.status) {
          if (isVisible(existing.status) && isVisible(dto.status)) {
            const scope = and(scopeFor(dto.status), ne(miniAppTable.appId, appId));
            const [before] = await tx
              .select({ orderKey: miniAppTable.orderKey })
              .from(miniAppTable)
              .where(and(scope, lt(miniAppTable.orderKey, existing.orderKey)))
              .orderBy(desc(miniAppTable.orderKey))
              .limit(1);
            const [same] = await tx
              .select({ orderKey: miniAppTable.orderKey })
              .from(miniAppTable)
              .where(and(scope, eq(miniAppTable.orderKey, existing.orderKey)))
              .limit(1);
            const [after] = await tx
              .select({ orderKey: miniAppTable.orderKey })
              .from(miniAppTable)
              .where(and(scope, gt(miniAppTable.orderKey, existing.orderKey)))
              .orderBy(asc(miniAppTable.orderKey))
              .limit(1);
            if (same) {
              updates.orderKey =
                existing.status === 'enabled'
                  ? generateOrderKeyBetween(before?.orderKey ?? null, same.orderKey)
                  : generateOrderKeyBetween(same.orderKey, after?.orderKey ?? null);
            } else if (before || after) {
              updates.orderKey = generateOrderKeyBetween(
                before?.orderKey ?? null,
                after?.orderKey ?? null,
              );
            }
          } else {
            const [tail] = await tx
              .select({ orderKey: miniAppTable.orderKey })
              .from(miniAppTable)
              .where(and(scopeFor(dto.status), ne(miniAppTable.appId, appId)))
              .orderBy(desc(miniAppTable.orderKey))
              .limit(1);
            updates.orderKey = generateOrderKeyBetween(tail?.orderKey ?? null, null);
          }
        }
      }
      const [row] = await tx
        .update(miniAppTable)
        .set(updates)
        .where(eq(miniAppTable.appId, appId))
        .returning();
      if (!row) throw DataApiErrorFactory.notFound('MiniApp', appId);
      return rowToMiniApp(row);
    });
  }

  async delete(appId: string): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select({ presetMiniAppId: miniAppTable.presetMiniAppId })
        .from(miniAppTable)
        .where(eq(miniAppTable.appId, appId))
        .limit(1);
      if (!existing) throw DataApiErrorFactory.notFound('MiniApp', appId);
      if (existing.presetMiniAppId !== null) {
        throw DataApiErrorFactory.invalidOperation(
          `delete miniapp ${appId}`,
          'preset-derived miniapp cannot be deleted; disable it instead',
        );
      }
      await tx.delete(miniAppTable).where(eq(miniAppTable.appId, appId));
    });
  }

  async reorder(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    if (moves.length === 0) return;
    await this.dbService.withWriteTx(async (tx) => {
      const ids = moves.map(({ id }) => id);
      const rows = await tx
        .select({ appId: miniAppTable.appId, status: miniAppTable.status })
        .from(miniAppTable)
        .where(inArray(miniAppTable.appId, ids));
      if (rows.length === 0) throw DataApiErrorFactory.notFound('MiniApp', ids[0]);
      const hasVisible = rows.some(({ status }) => isVisible(status));
      const hasHidden = rows.some(({ status }) => !isVisible(status));
      if (hasVisible && hasHidden) {
        const message = 'MiniApp reorder batch cannot span visible and hidden lists';
        throw DataApiErrorFactory.validation({ _root: [message] }, message);
      }
      await applyMoves(tx, miniAppTable, moves, {
        pkColumn: miniAppTable.appId,
        scope: hasVisible ? scopeFor('enabled') : eq(miniAppTable.status, 'disabled'),
      });
    });
  }
}
