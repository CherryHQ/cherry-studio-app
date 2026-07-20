import type { DbService } from '@/data/db/DbService';
import { chatMessageFileRefTable, messageTable } from '@/data/db/schemas';
import type { Message, MessageData } from '@/data/types/message';
import { MessageService } from '../MessageService';

jest.mock('@/data/db/schemas', () => ({
  chatMessageFileRefTable: {
    fileEntryId: 'chatMessageFileRef.fileEntryId',
    sourceId: 'chatMessageFileRef.sourceId',
  },
  fileEntryTable: {
    id: 'fileEntry.id',
  },
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
    const service = new MessageService({} as never, {} as never, {} as never);
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
    const service = new MessageService(dbService, {} as never, {} as never);

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
    const service = new MessageService(dbService, {} as never, {} as never);

    await service.markMessagesError(['a', 'b']);

    expect(withWriteTx).toHaveBeenCalledTimes(1);
    expect(updateCalls).toEqual([{ status: 'error' }]);
  });

  test('markMessagesError is a no-op for an empty id list', async () => {
    const withWriteTx = jest.fn();
    const dbService = { withWriteTx } as unknown as DbService;
    const service = new MessageService(dbService, {} as never, {} as never);

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
    const service = new MessageService(dbService, topicService as never, {} as never);
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
    const service = new MessageService(dbService, topicService as never, {} as never);
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
      delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
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
    const service = new MessageService(dbService, topicService as never, {} as never);

    const sibling = await service.createSibling('source-1', { parts: [] });

    expect(insertedValues).toEqual([expect.objectContaining({ status: expectedStatus })]);
    expect(sibling.status).toBe(expectedStatus);
    expect(topicService.setActiveNodeTx).toHaveBeenCalledWith(tx, topicId, 'sibling-1', {
      assumeValid: true,
    });
  });

  test('atomically creates prepared entries, messages, and deduplicated refs', async () => {
    const firstId = '00000000-0000-7000-8000-000000000001';
    const secondId = '00000000-0000-7000-8000-000000000002';
    const unknownId = '00000000-0000-7000-8000-000000000003';
    const userData = {
      parts: [filePart(firstId), filePart(firstId), filePart(unknownId)],
    } satisfies MessageData;
    const placeholderData = { parts: [filePart(secondId)] } satisfies MessageData;
    const userRow = createMessageRow('user-1', 'user', userData, 'root-1');
    const placeholderRow = createMessageRow('assistant-1', 'assistant', placeholderData, 'user-1');
    const { insertCalls, tx } = createWriteTx({
      insertRows: [userRow, placeholderRow],
      selectResults: [
        [{ id: 'topic-1' }],
        [{ id: 'root-1' }],
        [{ id: firstId }],
        [{ id: secondId }],
      ],
    });
    const dbService = {
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService;
    const topicService = { setActiveNodeTx: jest.fn(async () => undefined) };
    const createPreparedEntriesTx = jest.fn(async () => undefined);
    const service = new MessageService(
      dbService,
      topicService as never,
      { createPreparedEntriesTx } as never,
    );
    const preparedFiles = [
      {
        ext: 'txt',
        id: firstId,
        name: 'brief',
        size: 12,
        uri: 'file:///documents/files/brief.txt',
      },
    ];

    await service.createUserMessageWithPlaceholders({
      placeholders: [{ data: placeholderData, role: 'assistant' }],
      preparedFiles,
      topicId: 'topic-1',
      userMessage: { dto: { data: userData, role: 'user' }, mode: 'create' },
    });

    expect(createPreparedEntriesTx).toHaveBeenCalledWith(tx, preparedFiles);
    expect(createPreparedEntriesTx.mock.invocationCallOrder[0]).toBeLessThan(
      (tx.insert as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(insertCalls.filter((call) => call.table === messageTable)).toHaveLength(2);
    expect(insertCalls.filter((call) => call.table === chatMessageFileRefTable)).toEqual([
      {
        table: chatMessageFileRefTable,
        values: [{ fileEntryId: firstId, role: 'attachment', sourceId: 'user-1' }],
      },
      {
        table: chatMessageFileRefTable,
        values: [{ fileEntryId: secondId, role: 'attachment', sourceId: 'assistant-1' }],
      },
    ]);
  });

  test('creates refs from the general create and createSibling entry points', async () => {
    const fileEntryId = '00000000-0000-7000-8000-000000000001';
    const data = { parts: [filePart(fileEntryId)] } satisfies MessageData;
    const createdRow = createMessageRow('message-1', 'user', data, 'active-1');
    const createTx = createWriteTx({
      insertRows: [createdRow],
      selectResults: [[{ activeNodeId: 'active-1', id: 'topic-1' }], [{ id: fileEntryId }]],
    });
    const createService = createMessageService(createTx.tx);

    await createService.create('topic-1', { data, role: 'user' });

    expect(createTx.insertCalls).toContainEqual({
      table: chatMessageFileRefTable,
      values: [{ fileEntryId, role: 'attachment', sourceId: 'message-1' }],
    });

    const sourceRow = createMessageRow('source-1', 'user', { parts: [] }, 'root-1');
    const siblingRow = createMessageRow('sibling-1', 'user', data, 'root-1');
    const siblingTx = createWriteTx({
      insertRows: [siblingRow],
      selectResults: [[sourceRow], [{ id: fileEntryId }]],
    });
    const siblingService = createMessageService(siblingTx.tx);

    await siblingService.createSibling('source-1', data);

    expect(siblingTx.insertCalls).toContainEqual({
      table: chatMessageFileRefTable,
      values: [{ fileEntryId, role: 'attachment', sourceId: 'sibling-1' }],
    });
  });

  test('replaces refs when message data is updated', async () => {
    const fileEntryId = '00000000-0000-7000-8000-000000000002';
    const previous = createMessageRow('message-1', 'user', { parts: [] }, 'root-1');
    const data = { parts: [filePart(fileEntryId)] } satisfies MessageData;
    const updated = { ...previous, data };
    const { deleteCalls, insertCalls, tx } = createWriteTx({
      selectResults: [[previous], [{ id: fileEntryId }]],
      updateRows: [updated],
    });
    const service = createMessageService(tx);

    await service.update('message-1', { data });

    expect(deleteCalls).toContain(chatMessageFileRefTable);
    expect(insertCalls).toContainEqual({
      table: chatMessageFileRefTable,
      values: [{ fileEntryId, role: 'attachment', sourceId: 'message-1' }],
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

function filePart(fileEntryId: string) {
  return {
    filename: 'brief.txt',
    mediaType: 'text/plain',
    providerMetadata: { cherry: { fileEntryId } },
    type: 'file' as const,
    url: 'file:///old-sandbox/brief.txt',
  };
}

function createMessageRow(
  id: string,
  role: Message['role'],
  data: MessageData,
  parentId: string | null,
) {
  return {
    createdAt: 1747267200000,
    data,
    deletedAt: null,
    ftsRowid: 1,
    id,
    modelId: null,
    modelSnapshot: null,
    parentId,
    role,
    searchableText: '',
    siblingsGroupId: 0,
    stats: null,
    status: role === 'assistant' ? 'pending' : 'success',
    topicId: 'topic-1',
    updatedAt: 1747267200000,
  };
}

function createMessageService(tx: ReturnType<typeof createWriteTx>['tx']) {
  return new MessageService(
    {
      getDb: () => ({ all: jest.fn(async () => []) }),
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService,
    { setActiveNodeTx: jest.fn(async () => undefined) } as never,
    { createPreparedEntriesTx: jest.fn(async () => undefined) } as never,
  );
}

function createWriteTx({
  insertRows = [],
  selectResults = [],
  updateRows = [],
}: {
  insertRows?: unknown[];
  selectResults?: unknown[][];
  updateRows?: unknown[];
}) {
  const deleteCalls: unknown[] = [];
  const insertCalls: { table: unknown; values: unknown }[] = [];
  const nextSelect = () => selectResults.shift() ?? [];
  const tx = {
    delete: jest.fn((table: unknown) => ({
      where: jest.fn(async () => {
        deleteCalls.push(table);
      }),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((values: unknown) => {
        insertCalls.push({ table, values });
        return Object.assign(Promise.resolve(undefined), {
          returning: jest.fn(async () =>
            table === messageTable ? [insertRows.shift()].filter(Boolean) : [],
          ),
        });
      }),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => {
          const rows = nextSelect();
          return Object.assign(Promise.resolve(rows), {
            limit: jest.fn(async () => rows),
          });
        }),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => [updateRows.shift()].filter(Boolean)),
        })),
      })),
    })),
  };

  return { deleteCalls, insertCalls, tx };
}
