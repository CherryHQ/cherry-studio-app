import type { DbService } from '@/data/db/DbService';
import type { Message } from '@/data/types/message';
import { MessageService } from '../MessageService';

jest.mock('@/data/db/schemas', () => ({
  messageTable: {
    deletedAt: 'message.deletedAt',
    id: 'message.id',
    parentId: 'message.parentId',
    role: 'message.role',
    topicId: 'message.topicId',
  },
  topicTable: {
    activeNodeId: 'topic.activeNodeId',
    deletedAt: 'topic.deletedAt',
    id: 'topic.id',
  },
}));

describe('MessageService', () => {
  test('reserveAssistantTurn delegates to createUserMessageWithPlaceholders', async () => {
    const service = new MessageService({} as never, {} as never);
    const result = {
      placeholders: [createMessage('650e8400-e29b-41d4-a716-446655440000', 'assistant')],
      userMessage: createMessage('550e8400-e29b-41d4-a716-446655440000', 'user'),
    };
    const input = {
      placeholders: [
        {
          data: { parts: [] },
          role: 'assistant' as const,
        },
      ],
      topicId: '750e8400-e29b-41d4-a716-446655440000',
      userMessage: {
        dto: {
          data: { parts: [] },
          role: 'user' as const,
        },
        mode: 'create' as const,
      },
    };
    const createTurn = jest
      .spyOn(service, 'createUserMessageWithPlaceholders')
      .mockResolvedValue(result);

    await expect(service.reserveAssistantTurn(input)).resolves.toBe(result);
    expect(createTurn).toHaveBeenCalledWith(input);
  });

  test('findPendingAssistantMessageIds returns the ids from the query result', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const dbService = {
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => Promise.resolve(rows),
          }),
        }),
      }),
    } as unknown as DbService;
    const service = new MessageService(dbService, {} as never);

    await expect(service.findPendingAssistantMessageIds()).resolves.toEqual(['a', 'b']);
  });

  test('markMessagesError updates the given ids to error status', async () => {
    const updateCalls: { status: string }[] = [];
    const tx = {
      update: () => ({
        set: (values: { status: string }) => ({
          where: () => {
            updateCalls.push(values);
            return Promise.resolve();
          },
        }),
      }),
    };
    const withWriteTx = jest.fn(async (callback: (fakeTx: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    const dbService = { withWriteTx } as unknown as DbService;
    const service = new MessageService(dbService, {} as never);

    await service.markMessagesError(['a', 'b']);

    expect(withWriteTx).toHaveBeenCalledTimes(1);
    expect(updateCalls).toEqual([{ status: 'error' }]);
  });

  test('markMessagesError is a no-op for an empty id list', async () => {
    const withWriteTx = jest.fn();
    const dbService = { withWriteTx } as unknown as DbService;
    const service = new MessageService(dbService, {} as never);

    await service.markMessagesError([]);

    expect(withWriteTx).not.toHaveBeenCalled();
  });

  test('clears the active node when deleting the first branch below the virtual root', async () => {
    const topicId = '750e8400-e29b-41d4-a716-446655440000';
    const message = { ...createMessage('message-1', 'user'), parentId: 'root-1', topicId };
    const topic = { activeNodeId: message.id, id: topicId };
    const topicUpdates: Record<string, unknown>[] = [];
    const db = {
      all: jest.fn(async () => []),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({ limit: jest.fn(async () => [topic]) })),
        })),
      })),
    };
    const tx = {
      delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({ limit: jest.fn(async () => [{ id: 'root-1' }]) })),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((values: Record<string, unknown>) => ({
          where: jest.fn(async () => {
            topicUpdates.push(values);
          }),
        })),
      })),
    };
    const dbService = {
      getDb: () => db,
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService;
    const topicService = { setActiveNodeTx: jest.fn() };
    const service = new MessageService(dbService, topicService as never);
    jest.spyOn(service, 'getById').mockResolvedValue(message);

    await expect(service.delete(message.id, true, 'parent')).resolves.toEqual({
      deletedIds: [message.id],
      newActiveNodeId: null,
    });
    expect(topicUpdates).toContainEqual({ activeNodeId: null });
    expect(topicService.setActiveNodeTx).not.toHaveBeenCalled();
  });

  test('delete without cascade rebases moved sibling groups above both sides', async () => {
    const topicId = '750e8400-e29b-41d4-a716-446655440000';
    const message = { ...createMessage('message-2', 'assistant'), parentId: 'parent-1', topicId };
    const topic = { activeNodeId: 'unrelated-node', id: topicId };
    // First tx select: children of the deleted node; second: groups already at
    // the destination parent. max(7, 5, 0) + 1 = 8 becomes the rebased group id.
    const selectResults: unknown[][] = [
      [
        { id: 'child-1', siblingsGroupId: 5 },
        { id: 'child-2', siblingsGroupId: 5 },
        { id: 'child-3', siblingsGroupId: 0 },
      ],
      [{ siblingsGroupId: 7 }],
    ];
    const moveUpdates: Record<string, unknown>[] = [];
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({ limit: jest.fn(async () => [topic]) })),
        })),
      })),
    };
    const tx = {
      delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(async () => selectResults.shift() ?? []),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((values: Record<string, unknown>) => ({
          where: jest.fn(async () => {
            moveUpdates.push(values);
          }),
        })),
      })),
    };
    const dbService = {
      getDb: () => db,
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService;
    const topicService = { setActiveNodeTx: jest.fn() };
    const service = new MessageService(dbService, topicService as never);
    jest.spyOn(service, 'getById').mockResolvedValue(message);

    await expect(service.delete(message.id, false, 'parent')).resolves.toEqual({
      deletedIds: [message.id],
      reparentedIds: ['child-1', 'child-2', 'child-3'],
    });
    expect(moveUpdates).toEqual([
      { parentId: 'parent-1', siblingsGroupId: 8 },
      { parentId: 'parent-1', siblingsGroupId: 0 },
    ]);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(topicService.setActiveNodeTx).not.toHaveBeenCalled();
  });

  test.each([
    ['user', 'success'],
    ['assistant', 'pending'],
  ] as const)('createSibling inserts a %s sibling with status %s', async (role, expectedStatus) => {
    const topicId = '750e8400-e29b-41d4-a716-446655440000';
    const sourceRow = {
      createdAt: 1747267200000,
      data: { parts: [] },
      deletedAt: null,
      ftsRowid: 1,
      id: 'source-1',
      modelId: null,
      modelSnapshot: null,
      parentId: 'parent-1',
      role,
      searchableText: '',
      siblingsGroupId: 42,
      stats: null,
      status: 'success',
      topicId,
      updatedAt: 1747267200000,
    };
    const insertedValues: Record<string, unknown>[] = [];
    const tx = {
      insert: jest.fn(() => ({
        values: jest.fn((values: Record<string, unknown>) => {
          insertedValues.push(values);
          return { returning: jest.fn(async () => [{ ...sourceRow, ...values, id: 'sibling-1' }]) };
        }),
      })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({ limit: jest.fn(async () => [sourceRow]) })),
        })),
      })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService;
    const topicService = { setActiveNodeTx: jest.fn() };
    const service = new MessageService(dbService, topicService as never);

    const sibling = await service.createSibling('source-1', { parts: [] });

    expect(insertedValues).toEqual([expect.objectContaining({ status: expectedStatus })]);
    expect(sibling.status).toBe(expectedStatus);
    expect(topicService.setActiveNodeTx).toHaveBeenCalledWith(tx, topicId, 'sibling-1', {
      assumeValid: true,
    });
  });
});

function createMessage(id: string, role: Message['role']): Message {
  const now = '2026-05-15T00:00:00.000Z';

  return {
    createdAt: now,
    data: { parts: [] },
    id,
    parentId: null,
    role,
    searchableText: '',
    siblingsGroupId: 0,
    status: 'pending',
    topicId: '750e8400-e29b-41d4-a716-446655440000',
    updatedAt: now,
  };
}
