import type { DbService } from '@/data/db/DbService';
import type { AssistantRow } from '@/data/db/schemas';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';

import { AssistantService } from '../AssistantService';
import type { ModelService } from '../ModelService';
import type { PinService } from '../PinService';
import type { PreferenceService } from '../PreferenceService';
import type { TagService } from '../TagService';
import { applyMoves, insertWithOrderKey } from '../utils/orderKey';

jest.mock('uuid', () => ({ v7: jest.fn(() => '00000000-0000-7000-8000-000000000000') }));
jest.mock('../utils/orderKey', () => ({
  applyMoves: jest.fn(),
  insertWithOrderKey: jest.fn(),
}));

describe('AssistantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reads desktop order and opaque knowledge/MCP relation ids without resolving targets', async () => {
    const row = createAssistantRow({
      settings: {
        ...DEFAULT_ASSISTANT_SETTINGS,
        futureDesktopSetting: { enabled: true },
        toolUseMode: 'prompt',
      },
    });
    const db = createReadDb(row);
    const tagService = {
      getTagsByEntitiesTx: jest.fn(async () => new Map([[row.id, []]])),
    } as unknown as TagService;
    const service = new AssistantService(
      { getDb: () => db } as unknown as DbService,
      {} as ModelService,
      {} as PreferenceService,
      tagService,
      {} as PinService,
    );

    const assistant = await service.getById(row.id);

    expect(assistant).toMatchObject({
      knowledgeBaseIds: ['unknown-knowledge-id'],
      mcpServerIds: ['unknown-mcp-id'],
      orderKey: 'a0',
      settings: {
        futureDesktopSetting: { enabled: true },
        toolUseMode: 'prompt',
      },
    });
  });

  test('preserves unknown settings and relation ids on an unrelated settings update', async () => {
    const row = createAssistantRow({
      settings: {
        ...DEFAULT_ASSISTANT_SETTINGS,
        futureDesktopSetting: { enabled: true },
        toolUseMode: 'prompt',
      },
    });
    const db = createReadDb(row);
    const { transaction, writtenSettings } = createUpdateTransaction(row);
    const tagService = {
      getTagsByEntitiesTx: jest.fn(async () => new Map([[row.id, []]])),
    } as unknown as TagService;
    const service = new AssistantService(
      {
        getDb: () => db,
        withWriteTx: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction),
      } as unknown as DbService,
      {} as ModelService,
      {} as PreferenceService,
      tagService,
      {} as PinService,
    );

    const assistant = await service.update(row.id, { settings: { temperature: 0.7 } });

    expect(writtenSettings()).toMatchObject({
      futureDesktopSetting: { enabled: true },
      temperature: 0.7,
      toolUseMode: 'prompt',
    });
    expect(assistant).toMatchObject({
      knowledgeBaseIds: ['unknown-knowledge-id'],
      mcpServerIds: ['unknown-mcp-id'],
      orderKey: 'a0',
      settings: {
        futureDesktopSetting: { enabled: true },
        temperature: 0.7,
        toolUseMode: 'prompt',
      },
    });
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  test('scopes create and reorder operations to live assistants', async () => {
    const row = createAssistantRow();
    jest.mocked(insertWithOrderKey).mockResolvedValue(row);
    const queryRows = Object.assign(Promise.resolve([{ id: row.id }]), {
      limit: jest.fn(async () => [{ id: row.id }]),
    });
    const tx = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({ where: jest.fn(() => queryRows) })),
      })),
    };
    const tagService = {
      getTagsByEntitiesTx: jest.fn(async () => new Map([[row.id, []]])),
    } as unknown as TagService;
    const service = new AssistantService(
      {
        withWriteTx: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      } as unknown as DbService,
      {} as ModelService,
      { get: jest.fn(async () => null) } as unknown as PreferenceService,
      tagService,
      {} as PinService,
    );

    await service.create({ name: 'Assistant' });
    await service.reorder(row.id, { position: 'first' });
    await service.reorderBatch([{ anchor: { position: 'last' }, id: row.id }]);

    expect(jest.mocked(insertWithOrderKey).mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ scope: expect.anything() }),
    );
    expect(jest.mocked(applyMoves).mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ scope: expect.anything() }),
    );
    expect(jest.mocked(applyMoves).mock.calls[1]?.[3]).toEqual(
      expect.objectContaining({ scope: expect.anything() }),
    );
  });
});

function createReadDb(row: AssistantRow) {
  return {
    select: jest.fn((projection: Record<string, unknown>) => {
      if ('assistant' in projection) {
        return {
          from: jest.fn(() => ({
            leftJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn(async () => [{ assistant: row, modelName: null }]),
              })),
            })),
          })),
        };
      }

      if ('mcpServerId' in projection) {
        return createRelationQuery([{ assistantId: row.id, mcpServerId: 'unknown-mcp-id' }]);
      }

      if ('knowledgeBaseId' in projection) {
        return createRelationQuery([
          { assistantId: row.id, knowledgeBaseId: 'unknown-knowledge-id' },
        ]);
      }

      throw new Error(
        `Unexpected assistant select projection: ${Object.keys(projection).join(', ')}`,
      );
    }),
  };
}

function createRelationQuery(rows: Record<string, string>[]) {
  return {
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        orderBy: jest.fn(async () => rows),
      })),
    })),
  };
}

function createUpdateTransaction(row: AssistantRow) {
  let settings: AssistantRow['settings'] | undefined;
  const transaction = {
    delete: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(() => ({
      set: jest.fn((updates: Partial<AssistantRow>) => {
        settings = updates.settings;
        return {
          where: jest.fn(() => ({
            returning: jest.fn(async () => [{ ...row, ...updates }]),
          })),
        };
      }),
    })),
  };

  return { transaction, writtenSettings: () => settings };
}

function createAssistantRow(overrides: Partial<AssistantRow> = {}): AssistantRow {
  return {
    createdAt: 1_767_225_600_000,
    deletedAt: null,
    description: '',
    emoji: '😀',
    id: '00000000-0000-4000-8000-000000000001',
    modelId: null,
    name: 'Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    updatedAt: 1_767_225_600_000,
    ...overrides,
  };
}
