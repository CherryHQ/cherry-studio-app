import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { DbService } from '@/backend/data/db/DbService';
import type { AssistantRow } from '@/backend/data/db/schemas';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';

import type { PreferenceService } from '../../PreferenceService';
import { assistantService } from '../AssistantService';
import { applyMoves, insertWithOrderKey } from '../utils/orderKey';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));
jest.mock('../utils/orderKey', () => ({
  applyMoves: jest.fn(),
  insertWithOrderKey: jest.fn(),
}));

describe('AssistantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await uninstallTestHost();
    jest.restoreAllMocks();
  });

  test('reads desktop order and opaque MCP relation ids without resolving targets', async () => {
    const row = createAssistantRow({
      settings: {
        ...DEFAULT_ASSISTANT_SETTINGS,
        futureDesktopSetting: { enabled: true },
        toolUseMode: 'prompt',
      },
    });
    const db = createReadDb(row);
    // The service resolves `DbService` per call, so the fake is installed as a
    // host override rather than handed to a constructor.
    await installTestHost({ DbService: { getDb: () => db } as unknown as DbService });

    const assistant = await assistantService.getById(row.id);

    expect(assistant).toMatchObject({
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
    await installTestHost({
      DbService: {
        getDb: () => db,
        withWriteTx: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction),
      } as unknown as DbService,
    });

    const assistant = await assistantService.update(row.id, { settings: { temperature: 0.7 } });

    expect(writtenSettings()).toMatchObject({
      futureDesktopSetting: { enabled: true },
      temperature: 0.7,
      toolUseMode: 'prompt',
    });
    expect(assistant).toMatchObject({
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
    await installTestHost({
      DbService: {
        withWriteTx: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      } as unknown as DbService,
      PreferenceService: { get: jest.fn(async () => null) } as unknown as PreferenceService,
    });

    await assistantService.create({ name: 'Assistant' });
    await assistantService.reorder(row.id, { position: 'first' });
    await assistantService.reorderBatch([{ anchor: { position: 'last' }, id: row.id }]);

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
