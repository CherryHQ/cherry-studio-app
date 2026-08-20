import * as Crypto from 'expo-crypto';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { DbService } from '@/backend/data/db/DbService';
import { messageTable, topicTable } from '@/backend/data/db/schemas';

import { topicService } from '../TopicService';

jest.mock('@/backend/data/db/schemas', () => ({
  messageTable: {
    topicId: 'topicId',
  },
  topicTable: {
    deletedAt: 'deletedAt',
    id: 'id',
    traceId: 'traceId',
  },
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(),
}));

jest.mock('../utils/orderKey', () => ({
  applyMoves: jest.fn(),
  insertWithOrderKey: jest.fn(),
}));

afterEach(async () => {
  await uninstallTestHost();
  jest.restoreAllMocks();
});

describe('TopicService', () => {
  test('creates and persists a desktop-compatible trace id once', async () => {
    const expectedTraceId = '000102030405060708090a0b0c0d0e0f';
    jest
      .mocked(Crypto.getRandomBytes)
      .mockReturnValue(Uint8Array.from({ length: 16 }, (_, i) => i));
    const updates: Record<string, unknown>[] = [];
    const tx = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({ limit: jest.fn(async () => [{ traceId: null }]) })),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((values: Record<string, unknown>) => {
          updates.push(values);
          return { where: jest.fn(async () => undefined) };
        }),
      })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<string>) =>
        callback(tx),
      ),
    } as unknown as DbService;
    // The service resolves `DbService` per call, so the fake is installed as a
    // host override rather than handed to a constructor.
    await installTestHost({ DbService: dbService });

    await expect(topicService.ensureTraceId('550e8400-e29b-41d4-a716-446655440000')).resolves.toBe(
      expectedTraceId,
    );
    expect(updates).toEqual([{ traceId: expectedTraceId }]);
  });

  test("deletes a topic's messages before the topic itself, in one transaction", async () => {
    const deletedTables: unknown[] = [];
    type Tx = {
      delete: (table: unknown) => {
        where: () => Promise<void>;
      };
      select: () => {
        from: () => {
          where: () => Promise<{ id: string }[]>;
        };
      };
    };
    const tx: Tx = {
      delete: (table) => ({
        where: async () => {
          deletedTables.push(table);
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [
            { id: '550e8400-e29b-41d4-a716-446655440000' },
            { id: '650e8400-e29b-41d4-a716-446655440000' },
          ],
        }),
      }),
    };
    const dbService = {
      withWriteTx: async (callback: (tx: Tx) => Promise<void>) => callback(tx),
    } as unknown as DbService;
    await installTestHost({ DbService: dbService });
    const ids = ['550e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000'];

    // The duplicate id must not produce a third delete: messages are removed by
    // topic id, so a repeat would re-run the same statement.
    await topicService.deleteMany([...ids, ids[0]]);

    expect(deletedTables).toEqual([messageTable, topicTable]);
  });

  test('does not open a transaction for an empty batch delete', async () => {
    const dbService = { withWriteTx: jest.fn() } as unknown as DbService;
    await installTestHost({ DbService: dbService });

    await topicService.deleteMany([]);

    expect(dbService.withWriteTx).not.toHaveBeenCalled();
  });
});
