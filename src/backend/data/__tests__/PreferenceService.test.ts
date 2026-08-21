import type { DbService } from '@/backend/data/db/DbService';
import { PreferenceService } from '@/backend/data/PreferenceService';
import type { PreferenceKeyType } from '@/shared/data/preference';
import { PreferenceDefaults } from '@/shared/data/preference';

jest.mock('@/backend/data/db/schemas', () => ({
  preferenceTable: {
    key: 'key',
    value: 'value',
  },
}));

type PreferenceRow = {
  key: PreferenceKeyType;
  value: unknown;
};

type FakeDbService = DbService & {
  failNextWrite: boolean;
  rows: Map<string, PreferenceRow>;
  waitForNextWrite: () => Promise<void>;
  writeCount: number;
};

describe('PreferenceService', () => {
  test('initializes cache from defaults and database values', async () => {
    const dbService = createFakeDbService([
      {
        key: 'chat.default_model_id',
        value: 'provider:model',
      },
    ]);
    const service = new PreferenceService(dbService);

    await service._doInit();

    await expect(service.get('chat.default_model_id')).resolves.toBe('provider:model');
    await expect(service.get('app.language')).resolves.toBeNull();
  });

  test('loads known persisted values without key-specific parsing', async () => {
    const dbService = createFakeDbService([
      {
        key: 'chat.web_search.provider_overrides',
        value: {
          tavily: {
            capabilities: { searchKeywords: { apiHost: 42 } },
          },
        },
      },
      { key: 'permissions.location_read', value: 'always' },
      { key: 'permissions.health_read', value: 'invalid' },
    ]);
    const service = new PreferenceService(dbService);

    await service._doInit();

    await expect(service.get('chat.web_search.provider_overrides')).resolves.toEqual({
      tavily: {
        capabilities: { searchKeywords: { apiHost: 42 } },
      },
    });
    await expect(service.get('permissions.location_read')).resolves.toBe('always');
    await expect(service.get('permissions.health_read')).resolves.toBe('invalid');
  });

  test('writes permission preferences straight to their key', async () => {
    const dbService = createFakeDbService();
    const service = new PreferenceService(dbService);
    const listener = jest.fn();

    await service._doInit();
    service.subscribeChange('permissions.calendar_write')(listener);

    await service.set('permissions.calendar_write', 'ask');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(dbService.rows.get('permissions.calendar_write')).toMatchObject({
      key: 'permissions.calendar_write',
      value: 'ask',
    });
  });

  test('returns mapped and full cached preferences', async () => {
    const dbService = createFakeDbService([
      {
        key: 'ui.theme_mode',
        value: 'dark',
      },
    ]);
    const service = new PreferenceService(dbService);

    await service._doInit();

    expect(
      service.getMultipleCached({
        language: 'app.language',
        themeMode: 'ui.theme_mode',
      }),
    ).toEqual({
      language: null,
      themeMode: 'dark',
    });
    expect(service.getAll()).toMatchObject({
      'app.language': null,
      'ui.theme_mode': 'dark',
    });
    // getAll surfaces the whole schema, not just the keys the database stored.
    expect(Object.keys(service.getAll()).sort()).toEqual(Object.keys(PreferenceDefaults).sort());
  });

  test('writes changed values and notifies subscribed keys', async () => {
    const dbService = createFakeDbService();
    const service = new PreferenceService(dbService);
    const listener = jest.fn();

    await service._doInit();
    service.subscribeChange('chat.default_model_id')(listener);

    await service.set('chat.default_model_id', 'provider:model');

    expect(dbService.writeCount).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(dbService.rows.get('chat.default_model_id')).toMatchObject({
      key: 'chat.default_model_id',
      value: 'provider:model',
    });
  });

  test('skips unchanged primitive and object values', async () => {
    const overrides = {
      tavily: {
        apiKeys: ['secret'],
      },
    };
    const dbService = createFakeDbService([
      {
        key: 'chat.default_model_id',
        value: 'provider:model',
      },
      {
        key: 'chat.web_search.provider_overrides',
        value: overrides,
      },
    ]);
    const service = new PreferenceService(dbService);
    const primitiveListener = jest.fn();
    const objectListener = jest.fn();

    await service._doInit();
    service.subscribeChange('chat.default_model_id')(primitiveListener);
    service.subscribeChange('chat.web_search.provider_overrides')(objectListener);

    await service.set('chat.default_model_id', 'provider:model');
    await service.set('chat.web_search.provider_overrides', { ...overrides });

    expect(dbService.writeCount).toBe(0);
    expect(primitiveListener).not.toHaveBeenCalled();
    expect(objectListener).not.toHaveBeenCalled();
  });

  test('rolls back optimistic updates when persistence fails', async () => {
    const dbService = createFakeDbService([
      {
        key: 'chat.default_model_id',
        value: 'old:model',
      },
    ]);
    const service = new PreferenceService(dbService);
    const listener = jest.fn();

    await service._doInit();
    service.subscribeChange('chat.default_model_id')(listener);
    dbService.failNextWrite = true;

    await expect(service.set('chat.default_model_id', 'new:model')).rejects.toThrow('write failed');

    expect(service.getCachedValue('chat.default_model_id')).toBe('old:model');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('serializes optimistic writes', async () => {
    const dbService = createFakeDbService([
      {
        key: 'chat.default_model_id',
        value: 'initial:model',
      },
    ]);
    const service = new PreferenceService(dbService);

    await service._doInit();

    const firstWrite = service.set('chat.default_model_id', 'first:model');
    await dbService.waitForNextWrite();
    const secondWrite = service.set('chat.default_model_id', 'second:model');

    expect(service.getCachedValue('chat.default_model_id')).toBe('first:model');

    await firstWrite;
    await secondWrite;

    expect(dbService.writeCount).toBe(2);
    expect(service.getCachedValue('chat.default_model_id')).toBe('second:model');
    expect(dbService.rows.get('chat.default_model_id')?.value).toBe('second:model');
  });
});

function createFakeDbService(rows: PreferenceRow[] = []) {
  const rowMap = new Map(rows.map((row) => [row.key, row]));
  const writeWaiters: (() => void)[] = [];

  const db = {
    insert: () => ({
      values: (row: PreferenceRow) => ({
        onConflictDoUpdate: ({ set }: { set: Partial<PreferenceRow> }) => {
          rowMap.set(row.key, {
            ...row,
            ...set,
          });

          return Promise.resolve();
        },
      }),
    }),
    select: () => ({
      from: () => Promise.resolve(Array.from(rowMap.values())),
    }),
  };

  const service = {
    failNextWrite: false,
    getDb: () => db,
    rows: rowMap,
    waitForNextWrite: () =>
      new Promise<void>((resolve) => {
        writeWaiters.push(resolve);
      }),
    withWriteTx: async (callback: (tx: typeof db) => Promise<unknown>) => {
      service.writeCount += 1;
      writeWaiters.shift()?.();

      if (service.failNextWrite) {
        service.failNextWrite = false;
        throw new Error('write failed');
      }

      await callback(db);
    },
    writeCount: 0,
  } as unknown as FakeDbService;

  return service;
}
