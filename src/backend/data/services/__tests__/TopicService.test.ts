import * as Crypto from 'expo-crypto';

import type { DbService } from '@/backend/data/db/DbService';
import type { PinService } from '@/backend/data/services/PinService';
import type { TagService } from '@/backend/data/services/TagService';
import { TopicService } from '../TopicService';

jest.mock('@/backend/data/db/schemas', () => ({
  messageTable: {
    topicId: 'topicId',
  },
  pinTable: {},
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
    const service = new TopicService(dbService, {} as PinService, {} as TagService);

    await expect(service.ensureTraceId('550e8400-e29b-41d4-a716-446655440000')).resolves.toBe(
      expectedTraceId,
    );
    expect(updates).toEqual([{ traceId: expectedTraceId }]);
  });

  test('purges topic bindings when deleting topics in one transaction', async () => {
    const operations: string[] = [];
    type Tx = {
      delete: () => {
        where: () => Promise<void>;
      };
      select: () => {
        from: () => {
          where: () => Promise<{ id: string }[]>;
        };
      };
    };
    const tx: Tx = {
      delete: () => ({
        where: async () => {
          operations.push('delete');
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
    const pinService = {
      purgeForEntitiesTx: jest.fn(async () => {
        operations.push('pin');
      }),
    } as unknown as PinService;
    const tagService = {
      purgeForEntitiesTx: jest.fn(async () => {
        operations.push('tag');
      }),
    } as unknown as TagService;
    const service = new TopicService(dbService, pinService, tagService);
    const ids = ['550e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000'];

    await service.deleteMany([...ids, ids[0]]);

    expect(tagService.purgeForEntitiesTx).toHaveBeenCalledWith(tx, 'topic', ids);
    expect(pinService.purgeForEntitiesTx).toHaveBeenCalledWith(tx, 'topic', ids);
    expect(operations).toEqual(['delete', 'tag', 'pin', 'delete']);
  });

  test('does not open a transaction for an empty batch delete', async () => {
    const dbService = { withWriteTx: jest.fn() } as unknown as DbService;
    const service = new TopicService(dbService, {} as PinService, {} as TagService);

    await service.deleteMany([]);

    expect(dbService.withWriteTx).not.toHaveBeenCalled();
  });
});
