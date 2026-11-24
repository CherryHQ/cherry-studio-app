import { DatabaseSync } from 'node:sqlite';

import { and, asc, eq, ne } from 'drizzle-orm';

import { userModelTable } from '@/backend/data/db/schemas/userModel';
import { userProviderTable } from '@/backend/data/db/schemas/userProvider';
import { ErrorCode } from '@/shared/data/api/errors';

import { createTestDb, type TestDb } from '../../__tests__/_testDb';
import {
  applyMoves,
  applyScopedMoves,
  computeNewOrderKey,
  generateOrderKeySequence,
  insertManyWithOrderKey,
  insertWithOrderKey,
  resetOrder,
} from '../orderKey';

describe('orderKey helpers', () => {
  let sqlite: DatabaseSync;
  let testDb: TestDb;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    testDb = createTestDb(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  function insertProvider(providerId: string, isEnabled = true, orderKey = 'a0'): void {
    sqlite
      .prepare(
        `INSERT INTO user_provider (
          provider_id, preset_provider_id, name, is_enabled, order_key, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, 1, 1)`,
      )
      .run(providerId, providerId, isEnabled ? 1 : 0, orderKey);
  }

  function insertModel(providerId: string, modelId: string, orderKey: string): void {
    sqlite
      .prepare(
        `INSERT INTO user_model (
          id, provider_id, model_id, name, capabilities, is_enabled, supports_streaming, order_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '[]', 1, 1, ?, 1, 1)`,
      )
      .run(`${providerId}::${modelId}`, providerId, modelId, modelId, orderKey);
  }

  test('generateOrderKeySequence produces strictly sorted fractional keys', () => {
    expect(generateOrderKeySequence(0)).toEqual([]);
    const keys = generateOrderKeySequence(5);
    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(5);
  });

  test('resetOrder reassigns evenly spaced order keys inside a scope', async () => {
    insertProvider('openai');
    insertProvider('anthropic');
    insertModel('openai', 'c', 'a2');
    insertModel('openai', 'a', 'a0');
    insertModel('openai', 'b', 'a1');
    insertModel('anthropic', 'keep', 'z9');

    await testDb.dbService.withWriteTx((tx) =>
      resetOrder(tx, userModelTable, {
        orderBy: [asc(userModelTable.orderKey), asc(userModelTable.id)],
        pkColumn: userModelTable.id,
        scope: eq(userModelTable.providerId, 'openai'),
      }),
    );

    const openaiRows = await testDb.database
      .select({ id: userModelTable.id, orderKey: userModelTable.orderKey })
      .from(userModelTable)
      .where(eq(userModelTable.providerId, 'openai'))
      .orderBy(asc(userModelTable.orderKey));
    const anthropicRows = await testDb.database
      .select({ id: userModelTable.id, orderKey: userModelTable.orderKey })
      .from(userModelTable)
      .where(eq(userModelTable.providerId, 'anthropic'));

    expect(openaiRows.map((row) => row.id)).toEqual(['openai::a', 'openai::b', 'openai::c']);
    expect(openaiRows.map((row) => row.orderKey)).toEqual(generateOrderKeySequence(3));
    expect(anthropicRows).toEqual([{ id: 'anthropic::keep', orderKey: 'z9' }]);
  });

  test('applyScopedMoves reorders within a scope, deduplicates, and rejects invalid anchors', async () => {
    insertProvider('p1');
    insertProvider('p2');
    insertModel('p1', 'm1', 'a0');
    insertModel('p1', 'm2', 'a1');
    insertModel('p1', 'm3', 'a2');
    insertModel('p2', 'other', 'a0');

    await testDb.dbService.withWriteTx((tx) =>
      applyScopedMoves(
        tx,
        userModelTable,
        [
          { id: 'p1::m3', anchor: { before: 'p1::m2' } },
          { id: 'p1::m3', anchor: { position: 'first' } },
        ],
        {
          pkColumn: userModelTable.id,
          scopeColumn: userModelTable.providerId,
        },
      ),
    );

    const p1Rows = await testDb.database
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.providerId, 'p1'))
      .orderBy(asc(userModelTable.orderKey));
    expect(p1Rows.map((r) => r.id)).toEqual(['p1::m3', 'p1::m1', 'p1::m2']);

    await expect(
      testDb.dbService.withWriteTx((tx) =>
        applyScopedMoves(tx, userModelTable, [{ id: 'p1::m1', anchor: { after: 'p2::other' } }], {
          pkColumn: userModelTable.id,
          scopeColumn: userModelTable.providerId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    await expect(
      testDb.dbService.withWriteTx((tx) =>
        applyScopedMoves(tx, userModelTable, [{ id: 'p1::m1', anchor: { before: 'p1::m1' } }], {
          pkColumn: userModelTable.id,
          scopeColumn: userModelTable.providerId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  test('applyScopedMoves honors baseScope exclusions when reordering', async () => {
    insertProvider('cherryai', true, 'a0');
    insertProvider('openai', true, 'a1');
    insertProvider('anthropic', true, 'a2');
    insertProvider('deepseek', false, 'a0');

    await expect(
      testDb.dbService.withWriteTx((tx) =>
        applyScopedMoves(
          tx,
          userProviderTable,
          [{ id: 'cherryai', anchor: { position: 'last' } }],
          {
            baseScope: ne(userProviderTable.providerId, 'cherryai'),
            pkColumn: userProviderTable.providerId,
            scopeColumn: userProviderTable.isEnabled,
          },
        ),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    await testDb.dbService.withWriteTx((tx) =>
      applyScopedMoves(
        tx,
        userProviderTable,
        [{ id: 'anthropic', anchor: { position: 'first' } }],
        {
          baseScope: ne(userProviderTable.providerId, 'cherryai'),
          pkColumn: userProviderTable.providerId,
          scopeColumn: userProviderTable.isEnabled,
        },
      ),
    );

    const enabledRows = await testDb.database
      .select({ id: userProviderTable.providerId })
      .from(userProviderTable)
      .where(
        and(eq(userProviderTable.isEnabled, true), ne(userProviderTable.providerId, 'cherryai')),
      )
      .orderBy(asc(userProviderTable.orderKey));
    expect(enabledRows.map((r) => r.id)).toEqual(['anthropic', 'openai']);
  });

  test('writes the move even if a repair changed the target away from its original key', async () => {
    insertProvider('legacy');
    insertModel('legacy', 'a', 'a3');
    insertModel('legacy', 'b', 'a4');
    insertModel('legacy', 'c', 'c4');

    await testDb.dbService.withWriteTx((tx) =>
      applyScopedMoves(tx, userModelTable, [{ id: 'legacy::a', anchor: { after: 'legacy::c' } }], {
        pkColumn: userModelTable.id,
        scopeColumn: userModelTable.providerId,
      }),
    );

    const rows = sqlite.prepare('SELECT model_id FROM user_model ORDER BY order_key').all();
    expect(rows.map((row) => row.model_id)).toEqual(['b', 'c', 'a']);
  });

  test('repairs malformed legacy boundary keys during insert and reorder', async () => {
    insertProvider('legacy');
    // 'zz' is an invalid trailing key rejected by fractional-indexing.
    insertModel('legacy', 'm1', 'a0');
    insertModel('legacy', 'm2', 'zz');

    await testDb.dbService.withWriteTx((tx) =>
      insertManyWithOrderKey(
        tx,
        userModelTable,
        [
          {
            capabilities: [],
            id: 'legacy::m3',
            isEnabled: true,
            modelId: 'm3',
            name: 'm3',
            providerId: 'legacy',
            supportsStreaming: true,
          },
        ],
        {
          pkColumn: userModelTable.id,
          scope: eq(userModelTable.providerId, 'legacy'),
        },
      ),
    );

    const afterInsert = await testDb.database
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.providerId, 'legacy'))
      .orderBy(asc(userModelTable.orderKey));
    expect(afterInsert.map((r) => r.id)).toEqual(['legacy::m1', 'legacy::m2', 'legacy::m3']);

    // Inject another invalid key and verify computeNewOrderKey + applyMoves self-heal.
    sqlite.prepare(`UPDATE user_model SET order_key = 'zz' WHERE id = 'legacy::m3'`).run();

    await testDb.dbService.withWriteTx(async (tx) => {
      const nextKey = await computeNewOrderKey(
        tx,
        userModelTable,
        { before: 'legacy::m2' },
        {
          excludePkValue: 'legacy::m3',
          pkColumn: userModelTable.id,
          scope: eq(userModelTable.providerId, 'legacy'),
        },
      );
      expect(typeof nextKey).toBe('string');

      await applyMoves(
        tx,
        userModelTable,
        [{ id: 'legacy::m3', anchor: { before: 'legacy::m1' } }],
        {
          pkColumn: userModelTable.id,
          scope: eq(userModelTable.providerId, 'legacy'),
        },
      );
    });

    const afterMove = await testDb.database
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.providerId, 'legacy'))
      .orderBy(asc(userModelTable.orderKey));
    expect(afterMove.map((r) => r.id)).toEqual(['legacy::m3', 'legacy::m1', 'legacy::m2']);

    await testDb.dbService.withWriteTx((tx) =>
      insertWithOrderKey(
        tx,
        userModelTable,
        {
          capabilities: [],
          id: 'legacy::m0',
          isEnabled: true,
          modelId: 'm0',
          name: 'm0',
          providerId: 'legacy',
          supportsStreaming: true,
        },
        {
          pkColumn: userModelTable.id,
          position: 'first',
          scope: eq(userModelTable.providerId, 'legacy'),
        },
      ),
    );

    const afterPrepend = await testDb.database
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.providerId, 'legacy'))
      .orderBy(asc(userModelTable.orderKey));
    expect(afterPrepend.map((r) => r.id)).toEqual([
      'legacy::m0',
      'legacy::m3',
      'legacy::m1',
      'legacy::m2',
    ]);
  });
});
