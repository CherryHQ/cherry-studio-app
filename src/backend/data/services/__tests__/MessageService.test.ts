import type { Message, MessageData } from '@cherrystudio/universal/data/types/message';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { DbService } from '@/backend/data/db/DbService';
import { chatMessageFileRefTable, messageTable } from '@/backend/data/db/schemas';

import { registerDataService } from '../dataServiceRegistry';
import { messageService } from '../MessageService';

jest.mock('@/backend/data/db/schemas', () => ({
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

afterEach(async () => {
  await uninstallTestHost();
  // The service under test is a module singleton, so a spy left on it would
  // follow the next case in this file instead of dying with its instance.
  jest.restoreAllMocks();
});

describe('MessageService', () => {
  test('reserveAssistantTurn delegates to createUserMessageWithPlaceholders', async () => {
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
      .spyOn(messageService, 'createUserMessageWithPlaceholders')
      .mockResolvedValue(result);

    await expect(messageService.reserveAssistantTurn(input)).resolves.toBe(result);
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
    await installTestHost({ DbService: dbService });

    await expect(messageService.findPendingAssistantMessageIds()).resolves.toEqual(['a', 'b']);
  });

  describe('settleCrashedMessages', () => {
    async function installSettleHost(rows: Record<string, unknown>[]) {
      const updates: Record<string, unknown>[] = [];
      const tx = {
        select: () => ({ from: () => ({ where: async () => rows }) }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: () => {
              updates.push(values);
              return Promise.resolve();
            },
          }),
        }),
      };
      const withWriteTx = jest.fn(async (callback: (fakeTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
      );
      const dbService = { withWriteTx } as unknown as DbService;
      await installTestHost({ DbService: dbService });

      return { updates, withWriteTx };
    }

    test('flips the given ids to error status', async () => {
      const { updates, withWriteTx } = await installSettleHost([]);

      await messageService.settleCrashedMessages(['a', 'b']);

      expect(withWriteTx).toHaveBeenCalledTimes(1);
      expect(updates).toEqual([{ status: 'error' }]);
    });

    test('settles unresolved tool approvals so the branch stays replayable', async () => {
      const { updates } = await installSettleHost([
        {
          data: {
            parts: [
              {
                approval: { id: 'a1' },
                state: 'approval-requested',
                toolCallId: 'call-a1',
                toolName: 'search',
                type: 'dynamic-tool',
              },
              {
                approval: { approved: true, id: 'a2' },
                state: 'approval-responded',
                toolCallId: 'call-a2',
                toolName: 'create',
                type: 'dynamic-tool',
              },
            ],
          },
          id: 'assistant-1',
        },
      ]);

      await messageService.settleCrashedMessages(['assistant-1']);

      // The status flip is the half that always applies; the per-row catch is
      // what keeps one bad part from rolling it back with the transaction.
      expect(updates[0]).toEqual({ status: 'error' });
      const parts = (updates[1]?.data as { parts: unknown[] }).parts;
      expect(parts[0]).toMatchObject({
        approval: { approved: false, id: 'a1' },
        state: 'output-denied',
      });
      expect(parts[1]).toMatchObject({
        approval: { approved: true, id: 'a2' },
        state: 'output-error',
      });
    });

    test('still settles the status when a row has a part it cannot repair', async () => {
      // Parts come back as JSON off disk: a shape the types promise can still
      // be missing in an old or restored row. Losing the status flip over it
      // would leave the message generating forever, relaunch after relaunch.
      const { updates } = await installSettleHost([
        {
          data: { parts: [{ state: 'approval-requested', type: 'dynamic-tool' }] },
          id: 'assistant-1',
        },
      ]);

      await expect(messageService.settleCrashedMessages(['assistant-1'])).resolves.toBeUndefined();

      expect(updates).toEqual([{ status: 'error' }]);
    });

    test('leaves parts untouched when nothing was awaiting approval', async () => {
      const { updates } = await installSettleHost([
        { data: { parts: [{ text: 'hi', type: 'text' }] }, id: 'assistant-1' },
      ]);

      await messageService.settleCrashedMessages(['assistant-1']);

      expect(updates).toEqual([{ status: 'error' }]);
    });

    test('is a no-op for an empty id list', async () => {
      const withWriteTx = jest.fn();
      const dbService = { withWriteTx } as unknown as DbService;
      await installTestHost({ DbService: dbService });

      await messageService.settleCrashedMessages([]);

      expect(withWriteTx).not.toHaveBeenCalled();
    });
  });

  describe('applyToolApprovalDecisions', () => {
    const requestedPart = (approvalId: string) => ({
      approval: { id: approvalId },
      input: {},
      state: 'approval-requested',
      toolCallId: `call-${approvalId}`,
      toolName: 'search',
      type: 'dynamic-tool',
    });

    const respondedPart = (approvalId: string) => ({
      ...requestedPart(approvalId),
      approval: { approved: true, id: approvalId },
      state: 'approval-responded',
    });

    async function installApprovalHost(row?: Record<string, unknown>) {
      const updates: Record<string, unknown>[] = [];
      const tx = {
        select: jest.fn(() => ({
          from: jest.fn(() => ({
            where: jest.fn(() => ({ limit: jest.fn(async () => (row ? [row] : [])) })),
          })),
        })),
        update: jest.fn(() => ({
          set: jest.fn((values: Record<string, unknown>) => ({
            where: jest.fn(async () => {
              updates.push(values);
            }),
          })),
        })),
      };
      const dbService = {
        withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
        ),
      } as unknown as DbService;
      await installTestHost({ DbService: dbService });
      return { updates };
    }

    const baseRow = {
      createdAt: 1747267200000,
      data: { parts: [] },
      deletedAt: null,
      id: 'assistant-1',
      modelId: null,
      messageSnapshot: null,
      parentId: 'user-1',
      role: 'assistant',
      searchableText: '',
      siblingsGroupId: 0,
      stats: null,
      status: 'paused',
      topicId: 'topic-1',
      updatedAt: 1747267200000,
    };

    test('applies updated input and atomically marks the final approval pending', async () => {
      const { updates } = await installApprovalHost({
        ...baseRow,
        data: { parts: [requestedPart('a1')] },
        status: 'success',
      });

      const result = await messageService.applyToolApprovalDecisions('assistant-1', [
        { approvalId: 'a1', approved: true, updatedInput: { query: 'revised' } },
      ]);

      expect(result).toMatchObject({
        appliedApprovalIds: ['a1'],
        alreadySettledApprovalIds: [],
      });
      expect(updates[0]).toMatchObject({ status: 'pending' });
      expect((updates[0]?.data as { parts: unknown[] }).parts[0]).toMatchObject({
        approval: { approved: true, id: 'a1' },
        input: { query: 'revised' },
        state: 'approval-responded',
      });
    });

    test('keeps the status while other approvals are still pending', async () => {
      const { updates } = await installApprovalHost({
        ...baseRow,
        data: { parts: [requestedPart('a1'), requestedPart('a2')] },
      });

      const result = await messageService.applyToolApprovalDecisions('assistant-1', [
        { approvalId: 'a1', approved: false, reason: 'no' },
      ]);

      expect(result?.appliedApprovalIds).toEqual(['a1']);
      expect(updates[0]?.status).toBeUndefined();
    });

    test('reports an already-settled duplicate without writing', async () => {
      const { updates } = await installApprovalHost({
        ...baseRow,
        data: { parts: [respondedPart('a1')] },
      });

      const result = await messageService.applyToolApprovalDecisions('assistant-1', [
        { approvalId: 'a1', approved: false },
      ]);

      expect(result).toMatchObject({
        appliedApprovalIds: [],
        alreadySettledApprovalIds: ['a1'],
      });
      expect(updates).toEqual([]);
    });

    test('leaves the row untouched when no decision matches', async () => {
      const { updates } = await installApprovalHost({
        ...baseRow,
        data: { parts: [requestedPart('a1')] },
      });

      const result = await messageService.applyToolApprovalDecisions('assistant-1', [
        { approvalId: 'other', approved: true },
      ]);

      expect(result).toMatchObject({ appliedApprovalIds: [], alreadySettledApprovalIds: [] });
      expect(updates).toEqual([]);
    });

    test('returns null when the message no longer exists', async () => {
      const { updates } = await installApprovalHost();

      await expect(
        messageService.applyToolApprovalDecisions('missing', [
          { approvalId: 'a1', approved: true },
        ]),
      ).resolves.toBeNull();
      expect(updates).toEqual([]);
    });

    test('does not gate decisions by message role or status', async () => {
      const { updates } = await installApprovalHost({
        ...baseRow,
        data: { parts: [requestedPart('a1')] },
        role: 'user',
        status: 'success',
      });

      await messageService.applyToolApprovalDecisions('assistant-1', [
        { approvalId: 'a1', approved: true },
      ]);

      expect(updates[0]).toMatchObject({ status: 'pending' });
    });
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
    await installTestHost({ DbService: dbService });
    const topicService = { setActiveNodeTx: jest.fn() };
    // `MessageService` locates its sibling lazily to break the import cycle
    // between the two, so a stand-in goes through the registry rather than a
    // constructor argument. Leaving it unregistered would throw on first reach.
    registerDataService('TopicService', topicService as never);
    jest.spyOn(messageService, 'getById').mockResolvedValue(message);

    await expect(messageService.delete(message.id, true, 'parent')).resolves.toEqual({
      deletedIds: [message.id],
      newActiveNodeId: null,
    });
    expect(topicUpdates).toContainEqual({ activeNodeId: null });
    expect(topicService.setActiveNodeTx).not.toHaveBeenCalled();
  });

  test('clearTopicMessages removes content while preserving the virtual root', async () => {
    const deleteWhere = jest.fn(async () => undefined);
    const tx = {
      delete: jest.fn(() => ({ where: deleteWhere })),
      select: jest
        .fn()
        .mockImplementationOnce(() => ({
          from: () => ({ where: () => ({ limit: async () => [{ id: 'root-1' }] }) }),
        }))
        .mockImplementationOnce(() => ({
          from: () => ({ where: async () => [{ id: 'message-1' }, { id: 'message-2' }] }),
        })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService;
    await installTestHost({ DbService: dbService });
    const topicService = { clearActiveNodeTx: jest.fn(async () => undefined) };
    registerDataService('TopicService', topicService as never);

    await expect(messageService.clearTopicMessages('topic-1')).resolves.toEqual({
      deletedIds: ['message-1', 'message-2'],
    });
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(topicService.clearActiveNodeTx).toHaveBeenCalledWith(tx, 'topic-1');
  });

  test('clearTopicMessages is read-only when a topic only has its virtual root', async () => {
    const tx = {
      delete: jest.fn(),
      select: jest
        .fn()
        .mockImplementationOnce(() => ({
          from: () => ({ where: () => ({ limit: async () => [{ id: 'root-1' }] }) }),
        }))
        .mockImplementationOnce(() => ({ from: () => ({ where: async () => [] }) })),
    };
    const dbService = {
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService;
    await installTestHost({ DbService: dbService });
    const topicService = { clearActiveNodeTx: jest.fn() };
    registerDataService('TopicService', topicService as never);

    await expect(messageService.clearTopicMessages('topic-1')).resolves.toEqual({ deletedIds: [] });
    expect(tx.delete).not.toHaveBeenCalled();
    expect(topicService.clearActiveNodeTx).not.toHaveBeenCalled();
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
    await installTestHost({ DbService: dbService });
    const topicService = { setActiveNodeTx: jest.fn() };
    registerDataService('TopicService', topicService as never);
    jest.spyOn(messageService, 'getById').mockResolvedValue(message);

    await expect(messageService.delete(message.id, false, 'parent')).resolves.toEqual({
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
      messageSnapshot: null,
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
    await installTestHost({ DbService: dbService });
    const topicService = { setActiveNodeTx: jest.fn() };
    registerDataService('TopicService', topicService as never);

    const sibling = await messageService.createSibling('source-1', { parts: [] });

    expect(insertedValues).toEqual([expect.objectContaining({ status: expectedStatus })]);
    expect(sibling.status).toBe(expectedStatus);
    expect(topicService.setActiveNodeTx).toHaveBeenCalledWith(tx, topicId, 'sibling-1', {
      assumeValid: true,
    });
  });

  test('creates messages and deduplicated refs for existing file entries', async () => {
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
    await installTestHost({ DbService: dbService });
    registerDataService('TopicService', {
      setActiveNodeTx: jest.fn(async () => undefined),
    } as never);

    await messageService.createUserMessageWithPlaceholders({
      placeholders: [{ data: placeholderData, role: 'assistant' }],
      topicId: 'topic-1',
      userMessage: { dto: { data: userData, role: 'user' }, mode: 'create' },
    });

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

  test('writes the ids the caller allocated for the reserved turn', async () => {
    const userMessageId = '00000000-0000-7000-8000-0000000000a1';
    const placeholderId = '00000000-0000-7000-8000-0000000000a2';
    const data = { parts: [] } satisfies MessageData;
    const { insertCalls, tx } = createWriteTx({
      insertRows: [
        createMessageRow(userMessageId, 'user', data, 'root-1'),
        createMessageRow(placeholderId, 'assistant', data, userMessageId),
      ],
      selectResults: [[{ id: 'topic-1' }], [{ id: 'root-1' }]],
    });
    await installMessageServiceHost(tx);

    // 调用方先分配 id 再插行：runtime 靠它在落库之前就把这一轮发布给界面。
    await messageService.createUserMessageWithPlaceholders({
      placeholders: [{ data, id: placeholderId, role: 'assistant' }],
      topicId: 'topic-1',
      userMessage: { dto: { data, role: 'user' }, id: userMessageId, mode: 'create' },
    });

    expect(
      insertCalls
        .filter((call) => call.table === messageTable)
        .map((call) => (call.values as { id?: string }).id),
    ).toEqual([userMessageId, placeholderId]);
  });

  test('leaves the id to the column default when the caller omits it', async () => {
    const data = { parts: [] } satisfies MessageData;
    const { insertCalls, tx } = createWriteTx({
      insertRows: [createMessageRow('generated-1', 'user', data, 'root-1')],
      selectResults: [[{ id: 'topic-1' }], [{ id: 'root-1' }]],
    });
    await installMessageServiceHost(tx);

    await messageService.createUserMessageWithPlaceholders({
      placeholders: [],
      topicId: 'topic-1',
      userMessage: { dto: { data, role: 'user' }, mode: 'create' },
    });

    // 缺省时连这个键都不能出现：`id: undefined` 会盖掉 drizzle 的 `$defaultFn`。
    expect(insertCalls[0]?.values).not.toHaveProperty('id');
  });

  test('creates refs from the general create and createSibling entry points', async () => {
    const fileEntryId = '00000000-0000-7000-8000-000000000001';
    const data = { parts: [filePart(fileEntryId)] } satisfies MessageData;
    const createdRow = createMessageRow('message-1', 'user', data, 'active-1');
    const createTx = createWriteTx({
      insertRows: [createdRow],
      selectResults: [[{ activeNodeId: 'active-1', id: 'topic-1' }], [{ id: fileEntryId }]],
    });
    await installMessageServiceHost(createTx.tx);

    await messageService.create('topic-1', { data, role: 'user' });

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
    // The singleton keeps no connection of its own, so the second half of this
    // case swaps the host rather than building a second service.
    await installMessageServiceHost(siblingTx.tx);

    await messageService.createSibling('source-1', data);

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
    await installMessageServiceHost(tx);

    await messageService.update('message-1', { data });

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
    messageSnapshot: null,
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

async function installMessageServiceHost(tx: ReturnType<typeof createWriteTx>['tx']) {
  await installTestHost({
    DbService: {
      getDb: () => ({ all: jest.fn(async () => []) }),
      withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DbService,
  });
  registerDataService('TopicService', { setActiveNodeTx: jest.fn(async () => undefined) } as never);
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
