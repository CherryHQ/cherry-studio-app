import * as Crypto from 'expo-crypto';

import type { DbService } from '@/data/db/DbService';
import type { PinService } from '@/data/services/PinService';
import type { TagService } from '@/data/services/TagService';
import type { Topic } from '@/data/types/topic';
import { TopicService } from '../TopicService';

jest.mock('@/data/db/schemas', () => ({
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

  test('purges topic tag bindings when deleting a topic', async () => {
    const operations: string[] = [];
    type Tx = {
      delete: () => {
        where: () => Promise<void>;
      };
    };
    const tx: Tx = {
      delete: () => ({
        where: async () => {
          operations.push('delete');
        },
      }),
    };
    const dbService = {
      withWriteTx: async (callback: (tx: Tx) => Promise<void>) => callback(tx),
    } as unknown as DbService;
    const pinService = {
      purgeForEntityTx: jest.fn(async () => {
        operations.push('pin');
      }),
    } as unknown as PinService;
    const tagService = {
      purgeForEntityTx: jest.fn(async () => {
        operations.push('tag');
      }),
    } as unknown as TagService;
    const service = new TopicService(dbService, pinService, tagService);
    jest.spyOn(service, 'getById').mockResolvedValue(createTopic());

    await service.delete('550e8400-e29b-41d4-a716-446655440000');

    expect(tagService.purgeForEntityTx).toHaveBeenCalledWith(
      tx,
      'topic',
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(pinService.purgeForEntityTx).toHaveBeenCalledWith(
      tx,
      'topic',
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(operations).toEqual(['delete', 'tag', 'pin', 'delete']);
  });
});

function createTopic(): Topic {
  const now = '2026-05-15T00:00:00.000Z';

  return {
    createdAt: now,
    id: '550e8400-e29b-41d4-a716-446655440000',
    isNameManuallyEdited: false,
    name: 'Topic',
    orderKey: 'a0',
    updatedAt: now,
  };
}
