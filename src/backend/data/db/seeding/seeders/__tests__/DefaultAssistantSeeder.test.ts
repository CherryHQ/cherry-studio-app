import type { DbService } from '@/backend/data/db/DbService';
import { createRootMessageTx } from '@/backend/data/services/MessageService';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';

import { DefaultAssistantSeeder } from '../DefaultAssistantSeeder';

jest.mock('uuid', () => ({ v7: jest.fn(() => '00000000-0000-7000-8000-000000000000') }));
jest.mock('@/backend/data/services/MessageService', () => ({
  createRootMessageTx: jest.fn(),
}));
jest.mock('@/backend/data/services/utils/orderKey', () => ({
  insertWithOrderKey: jest.fn(),
}));

describe('DefaultAssistantSeeder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a persisted default assistant with an empty topic and root on a fresh database', async () => {
    const tx = createTransaction([[], [], []]);
    jest
      .mocked(insertWithOrderKey)
      .mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000001' })
      .mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000002' });
    const seeder = new DefaultAssistantSeeder();

    await seeder.run(createDbService(tx));

    expect(jest.mocked(insertWithOrderKey)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(insertWithOrderKey).mock.calls[0]?.[2]).toMatchObject({
      emoji: '😀',
      modelId: null,
      name: 'Default Assistant',
      settings: DEFAULT_ASSISTANT_SETTINGS,
    });
    expect(jest.mocked(insertWithOrderKey).mock.calls[1]?.[2]).toMatchObject({
      activeNodeId: null,
      assistantId: '00000000-0000-4000-8000-000000000001',
      name: '',
    });
    expect(createRootMessageTx).toHaveBeenCalledWith(tx, '00000000-0000-4000-8000-000000000002');
    expect(tx.whereMocks).toHaveLength(3);
  });

  test('does not seed when user data already exists', async () => {
    const tx = createTransaction([[{ id: 'existing-assistant' }], [], []]);

    await new DefaultAssistantSeeder().run(createDbService(tx));

    expect(insertWithOrderKey).not.toHaveBeenCalled();
    expect(createRootMessageTx).not.toHaveBeenCalled();
  });
});

function createDbService(tx: ReturnType<typeof createTransaction>) {
  return {
    withWriteTx: (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
  } as unknown as DbService;
}

function createTransaction(results: Record<string, string>[][]) {
  let queryIndex = 0;
  const whereMocks: jest.Mock[] = [];
  return {
    whereMocks,
    select: jest.fn(() => ({
      from: jest.fn(() => {
        const rows = results[queryIndex++] ?? [];
        const limited = { limit: jest.fn(async () => rows) };
        const where = jest.fn(() => limited);
        whereMocks.push(where);
        return {
          ...limited,
          where,
        };
      }),
    })),
  };
}
