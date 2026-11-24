import type { DbService } from '@/backend/data/db/DbService';
import { PreferenceService } from '@/backend/data/PreferenceService';
import { LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';
import { ENTERPRISE_DEFAULT_MODEL_KEYS, PreferenceDefaults } from '@/shared/data/preference';
import {
  DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG as toolbarDefaults,
  unpinAssistantToolbarAction,
} from '@/shared/data/types/assistantMessageToolbar';

jest.mock('@/backend/data/db/schemas', () => ({
  DEFAULT_PREFERENCE_SCOPE: 'default',
  preferenceTable: {
    key: 'key',
    scope: 'scope',
    value: 'value',
  },
}));

type PreferenceRow = {
  key: string;
  scope: string;
  value: unknown;
};

type PreferenceInputRow = Omit<PreferenceRow, 'scope'> & Partial<Pick<PreferenceRow, 'scope'>>;

type FakeDbService = DbService & {
  failNextWrite: boolean;
  rows: Map<string, PreferenceRow>;
  waitForNextWrite: () => Promise<void>;
  writeCount: number;
};

describe('PreferenceService', () => {
  afterEach(() => setActiveProfile(LOCAL_PROFILE));
  test('rejects ordinary writes to enterprise defaults before changing any cache or row', async () => {
    setActiveProfile({
      id: 'enterprise',
      identity: { deployment: 'server', subject: 'user', authentication: 'password' },
      address: 'https://example.com',
    });
    const dbService = createFakeDbService();
    const service = new PreferenceService(dbService);
    await service._doInit();
    for (const key of ENTERPRISE_DEFAULT_MODEL_KEYS) {
      await expect(service.set(key, 'provider:model')).rejects.toThrow();
      expect(service.readCached(key)).toBeNull();
    }
    await expect(
      service.setMultiple({ 'ui.font_size_step': 1, 'agent.default_model_id': 'provider:model' }),
    ).rejects.toThrow();
    expect(service.readCached('ui.font_size_step')).toBe(0);
    expect(dbService.writeCount).toBe(0);
    await service.setMultiple({ 'ui.font_size_step': 1, 'agent.default_model_id': undefined });
    expect(service.readCached('ui.font_size_step')).toBe(1);
  });

  test('a failed listener cannot reject a persisted update or block other listeners', async () => {
    const service = new PreferenceService(createFakeDbService());
    const listener = jest.fn();
    await service._doInit();
    service.subscribeChange('ui.font_size_step')(() => {
      throw new Error('observer failed');
    });
    service.subscribeChange('ui.font_size_step')(listener);
    await expect(
      service.set('ui.font_size_step', 1, { optimistic: false }),
    ).resolves.toBeUndefined();
    expect(service.readCached('ui.font_size_step')).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('initializes cache from defaults and database values', async () => {
    const dbService = createFakeDbService([
      {
        key: 'agent.default_model_id',
        value: 'provider:model',
      },
    ]);
    const service = new PreferenceService(dbService);

    await service._doInit();

    await expect(service.get('agent.default_model_id')).resolves.toBe('provider:model');
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
      { key: 'app.user.name', value: 42 },
      { key: 'permissions.location_read', value: 'always' },
    ]);
    const service = new PreferenceService(dbService);

    await service._doInit();

    await expect(service.get('chat.web_search.provider_overrides')).resolves.toEqual({
      tavily: {
        capabilities: { searchKeywords: { apiHost: 42 } },
      },
    });
    await expect(service.get('app.user.name')).resolves.toBe(42);
    expect(service.getAll()).not.toHaveProperty('permissions.location_read');
  });

  test('writes preferences straight to their key', async () => {
    const dbService = createFakeDbService();
    const service = new PreferenceService(dbService);
    const listener = jest.fn();

    await service._doInit();
    service.subscribeChange('ui.font_size_step')(listener);

    await service.set('ui.font_size_step', 1);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(dbService.rows.get('ui.font_size_step')).toMatchObject({
      key: 'ui.font_size_step',
      scope: 'default',
      value: 1,
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
    service.subscribeChange('agent.default_model_id')(listener);

    await service.set('agent.default_model_id', 'provider:model');

    expect(dbService.writeCount).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(dbService.rows.get('agent.default_model_id')).toMatchObject({
      key: 'agent.default_model_id',
      scope: 'default',
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
        key: 'agent.default_model_id',
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
    service.subscribeChange('agent.default_model_id')(primitiveListener);
    service.subscribeChange('chat.web_search.provider_overrides')(objectListener);

    await service.set('agent.default_model_id', 'provider:model');
    await service.set('chat.web_search.provider_overrides', { ...overrides });

    expect(dbService.writeCount).toBe(0);
    expect(primitiveListener).not.toHaveBeenCalled();
    expect(objectListener).not.toHaveBeenCalled();
  });

  test('rolls back optimistic updates when persistence fails', async () => {
    const dbService = createFakeDbService([
      {
        key: 'agent.default_model_id',
        value: 'old:model',
      },
    ]);
    const service = new PreferenceService(dbService);
    const listener = jest.fn();

    await service._doInit();
    service.subscribeChange('agent.default_model_id')(listener);
    dbService.failNextWrite = true;

    await expect(service.set('agent.default_model_id', 'new:model')).rejects.toThrow(
      'write failed',
    );

    expect(service.getCachedValue('agent.default_model_id')).toBe('old:model');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('serializes optimistic writes', async () => {
    const dbService = createFakeDbService([
      {
        key: 'agent.default_model_id',
        value: 'initial:model',
      },
    ]);
    const service = new PreferenceService(dbService);

    await service._doInit();

    const firstWrite = service.set('agent.default_model_id', 'first:model');
    await dbService.waitForNextWrite();
    const secondWrite = service.set('agent.default_model_id', 'second:model');

    expect(service.getCachedValue('agent.default_model_id')).toBe('first:model');

    await firstWrite;
    await secondWrite;

    expect(dbService.writeCount).toBe(2);
    expect(service.getCachedValue('agent.default_model_id')).toBe('second:model');
    expect(dbService.rows.get('agent.default_model_id')?.value).toBe('second:model');
  });
});

function createFakeDbService(rows: PreferenceInputRow[] = []) {
  const rowMap = new Map(
    rows.map((row) => [row.key, { ...row, scope: row.scope ?? 'default' } as PreferenceRow]),
  );
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
      from: () => ({
        where: () => Promise.resolve(Array.from(rowMap.values())),
      }),
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

test.each([null, '', 'preferred ', 0, true, false, [], {}])(
  'returns disabled for stored null before preference defaulting (%p)',
  async (value) => {
    const key = 'chat.web_search.model_tools';
    const db = createFakeDbService([{ key, value }]);
    const service = new PreferenceService(db);
    await service._doInit();
    expect(service.getCachedValue(key)).toBe('disabled');
    expect(service.readCached(key)).toBe('disabled');
    await expect(service.get(key)).resolves.toBe('disabled');
    expect(db.rows.get(key)?.value).toEqual(value);
    expect(db.writeCount).toBe(0);
  },
);

test.each(['preferred', 'fallback', 'disabled'] as const)(
  'persists each model-tools choice across service initialization (%s)',
  async (choice) => {
    const legacy = 'chat.web_search.model_tools_preferred';
    const db = createFakeDbService([
      { key: legacy, value: false },
      {
        key: 'chat.web_search.model_tools',
        value: choice === 'preferred' ? 'fallback' : 'preferred',
      },
    ]);
    const first = new PreferenceService(db);
    await first._doInit();
    await first.set('chat.web_search.model_tools', choice);
    const second = new PreferenceService(db);
    await second._doInit();
    expect(second.readCached('chat.web_search.model_tools')).toBe(choice);
    expect(db.rows.get('chat.web_search.model_tools')?.value).toBe(choice);
    expect(second.getAll()).not.toHaveProperty(legacy);
    expect(db.rows.get(legacy)?.value).toBe(false);
  },
);

test('rolls the model-tools subscription back after a failed save', async () => {
  const key = 'chat.web_search.model_tools';
  const db = createFakeDbService([{ key, value: 'fallback' }]);
  const service = new PreferenceService(db);
  await service._doInit();
  const observed: unknown[] = [];
  service.subscribeChange(key)(() => observed.push(service.readCached(key)));
  db.failNextWrite = true;
  await expect(service.set(key, 'disabled')).rejects.toThrow('write failed');
  expect(observed).toEqual(['disabled', 'fallback']);
  expect(service.readCached(key)).toBe('fallback');
  expect(db.rows.get(key)?.value).toBe('fallback');
});

test('normalizes stored toolbar configuration into a stable cached snapshot without rewriting storage', async () => {
  const key = 'ui.chat.assistant_toolbar_actions';
  const raw = { pinned: ['delete', 'copy', 'copy'], overflow: ['share', 'delete'] };
  const db = createFakeDbService([{ key, value: raw }]);
  const service = new PreferenceService(db);
  await service._doInit();
  expect(service.getAll()[key]).toEqual({
    pinned: ['copy'],
    overflow: ['share', 'readAloud', 'retry', 'answerWith', 'fork', 'edit', 'translate', 'delete'],
  });
  const normalized = service.getCachedValue(key);
  expect(normalized).toEqual({
    pinned: ['copy'],
    overflow: ['share', 'readAloud', 'retry', 'answerWith', 'fork', 'edit', 'translate', 'delete'],
  });
  expect(service.getCachedValue(key)).toBe(normalized);
  expect(await service.get(key)).toBe(normalized);
  expect(db.rows.get(key)?.value).toEqual(raw);
  expect(db.writeCount).toBe(0);
});

test('compares nested toolbar arrays by value and persists order changes across initialization', async () => {
  const key = 'ui.chat.assistant_toolbar_actions';
  const db = createFakeDbService();
  const service = new PreferenceService(db);
  await service._doInit();
  const listener = jest.fn();
  service.subscribeChange(key)(listener);
  await service.setMultiple({
    [key]: { pinned: [...toolbarDefaults.pinned], overflow: [...toolbarDefaults.overflow] },
  });
  expect(db.writeCount).toBe(0);
  expect(listener).not.toHaveBeenCalled();
  const changed = unpinAssistantToolbarAction(toolbarDefaults, 'copy');
  await service.setMultiple({ [key]: changed });
  expect(db.writeCount).toBe(1);
  expect(listener).toHaveBeenCalledTimes(1);
  const reloaded = new PreferenceService(db);
  await reloaded._doInit();
  expect(reloaded.readCached(key)).toEqual(changed);
});

test('rolls optimistic toolbar edits back after a failed write', async () => {
  const key = 'ui.chat.assistant_toolbar_actions';
  const db = createFakeDbService();
  const service = new PreferenceService(db);
  await service._doInit();
  const observed: unknown[] = [];
  service.subscribeChange(key)(() => observed.push(service.readCached(key)));
  db.failNextWrite = true;
  const changed = unpinAssistantToolbarAction(toolbarDefaults, 'copy');
  await expect(service.set(key, changed, { optimistic: true })).rejects.toThrow('write failed');
  expect(observed).toEqual([changed, toolbarDefaults]);
  expect(service.readCached(key)).toBe(toolbarDefaults);
  expect(db.rows.has(key)).toBe(false);
});
