import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { eq } from 'drizzle-orm';

import {
  desktopConnectionTable,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import {
  DesktopProvidersSnapshotSchema,
  type DesktopProvidersSnapshot,
} from '@/shared/data/api/schemas/desktopConnections';
import { ENDPOINT_TYPE, REASONING_EFFORT } from '@/shared/data/types/model';

import { DesktopConnectionService } from '../DesktopConnectionService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

const connectionId = 'f676e1d5-24c6-4150-a3fa-0f4427964465';
const signal = () => new AbortController().signal;
const reasoning = { supportedEfforts: [REASONING_EFFORT.LOW] };

function provider(id = 'relay', modelIds = ['existing']) {
  return {
    id,
    name: 'Desktop provider',
    apiHost: 'https://desktop.example.com/v1',
    apiKeys: [{ id: 'desktop-key', key: 'desktop-secret', isEnabled: true }],
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    models: modelIds.map((modelId) => ({
      id: modelId,
      apiModelId: modelId,
      providerId: id,
      name: 'Desktop model',
      reasoning,
    })),
  };
}

function snapshot(...providers: ReturnType<typeof provider>[]) {
  return DesktopProvidersSnapshotSchema.parse({ version: 1, providers });
}

describe('DesktopConnectionService provider synchronization', () => {
  let testDb: TestDb;
  let service: DesktopConnectionService;

  beforeEach(async () => {
    testDb = createTestDb(new DatabaseSync(':memory:'));
    service = new DesktopConnectionService(testDb.dbService);
    await service.savePair(
      {
        id: connectionId,
        name: 'Desktop',
        desktopVersion: '2.0.8',
        activeBaseUrl: 'http://192.168.1.2:23333',
        baseUrls: ['http://192.168.1.2:23333'],
      },
      false,
      signal(),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    testDb.sqlite.close();
  });

  function importSnapshot(data: DesktopProvidersSnapshot, requestSignal = signal()) {
    return service.import(
      connectionId,
      data,
      {
        selections: data.providers.map(({ id }) => ({ providerId: id, mode: 'provider-models' })),
      },
      requestSignal,
    );
  }

  it('syncs provider configuration while keeping every existing model column', async () => {
    await importSnapshot(snapshot(provider()));
    await testDb.database.update(userProviderTable).set({
      name: 'Local provider',
      isEnabled: false,
      apiKeys: [{ id: 'local-key', key: 'local-secret', isEnabled: true }],
      endpointConfigs: {
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://local.example.com' },
      },
      defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      providerSettings: { notes: 'Local provider notes' },
      logoKey: 'icon:local-provider',
    });
    await testDb.database.update(userModelTable).set({
      name: 'Local model',
      notes: 'Keep my notes',
      isHidden: true,
      isEnabled: false,
      reasoning: { supportedEfforts: [REASONING_EFFORT.HIGH] },
      endpointTypes: [ENDPOINT_TYPE.ANTHROPIC_MESSAGES],
    });
    const [beforeProvider] = await testDb.database.select().from(userProviderTable);
    const [beforeModel] = await testDb.database.select().from(userModelTable);
    const data = snapshot(provider('relay', ['existing', 'missing']));
    data.providers[0]!.authConfig = { type: 'api-key', headerName: 'x-api-key' };
    data.providers[0]!.providerSettings = { notes: 'Desktop provider notes' };
    data.providers[0]!.apiFeatures = { reportsActualCost: true };

    expect(await service.preview(data)).toMatchObject({
      providers: [{ action: 'update', models: [{ action: 'skip' }, { action: 'add' }] }],
    });
    await expect(importSnapshot(data)).resolves.toEqual({
      providersAdded: 0,
      providersUpdated: 1,
      modelsAdded: 1,
      modelsSkipped: 1,
    });
    const [syncedProvider] = await testDb.database.select().from(userProviderTable);
    expect(syncedProvider).toMatchObject({
      apiFeatures: { reportsActualCost: true },
      apiKeys: data.providers[0]!.apiKeys,
      authConfig: { type: 'api-key', headerName: 'x-api-key' },
      createdAt: beforeProvider!.createdAt,
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://desktop.example.com/v1' },
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://local.example.com' },
      },
      isEnabled: true,
      logoKey: beforeProvider!.logoKey,
      name: 'Desktop provider',
      orderKey: beforeProvider!.orderKey,
      providerSettings: { notes: 'Desktop provider notes' },
    });
    expect(
      await testDb.database
        .select()
        .from(userModelTable)
        .where(eq(userModelTable.id, 'relay::existing')),
    ).toEqual([beforeModel]);
    const [added] = await testDb.database
      .select()
      .from(userModelTable)
      .where(eq(userModelTable.id, 'relay::missing'));
    expect(added).toMatchObject({ modelId: 'missing', reasoning });
    expect(added!.orderKey > beforeModel!.orderKey).toBe(true);

    const beforeRepeat = await testDb.database.select().from(userModelTable);
    await expect(importSnapshot(data)).resolves.toEqual({
      providersAdded: 0,
      providersUpdated: 1,
      modelsAdded: 0,
      modelsSkipped: 2,
    });
    expect(await testDb.database.select().from(userModelTable)).toEqual(beforeRepeat);
  });

  it.each(['cherryin', 'aihubmix'])(
    'syncs and enables the installed %s provider even when every model already exists',
    async (providerId) => {
      const data = snapshot(provider(providerId));
      await importSnapshot(data);
      await testDb.database.update(userProviderTable).set({ apiKeys: [], isEnabled: false });
      const beforeModels = await testDb.database.select().from(userModelTable);

      expect(await service.preview(data)).toMatchObject({
        providers: [{ id: providerId, action: 'update', models: [{ action: 'skip' }] }],
      });
      await expect(importSnapshot(data)).resolves.toEqual({
        providersAdded: 0,
        providersUpdated: 1,
        modelsAdded: 0,
        modelsSkipped: 1,
      });
      expect(await testDb.database.select().from(userProviderTable)).toMatchObject([
        {
          providerId,
          presetProviderId: providerId,
          isEnabled: true,
          apiKeys: data.providers[0]!.apiKeys,
        },
      ]);
      expect(await testDb.database.select().from(userModelTable)).toEqual(beforeModels);
    },
  );

  it('previews and imports only enabled PC providers and models', async () => {
    const data = snapshot(
      provider('enabled', ['enabled', 'disabled', 'legacy']),
      provider('disabled'),
    );
    data.providers[0]!.isEnabled = true;
    data.providers[0]!.models[0]!.isEnabled = true;
    data.providers[0]!.models[1]!.isEnabled = false;
    data.providers[1]!.isEnabled = false;
    const preview = await service.preview(data);
    expect(preview.providers).toHaveLength(1);
    expect(preview.providers[0]!.models.map((model) => model.modelId)).toEqual([
      'enabled',
      'legacy',
    ]);

    await expect(
      service.import(
        connectionId,
        data,
        { selections: [{ providerId: 'enabled', mode: 'provider-models' }] },
        signal(),
      ),
    ).resolves.toEqual({
      providersAdded: 1,
      providersUpdated: 0,
      modelsAdded: 2,
      modelsSkipped: 0,
    });
    expect(await testDb.database.select().from(userProviderTable)).toMatchObject([
      { providerId: 'enabled', isEnabled: true },
    ]);
    const models = await testDb.database.select().from(userModelTable);
    expect(new Set(models.map((model) => model.modelId))).toEqual(new Set(['enabled', 'legacy']));
    expect(models.every((model) => model.isEnabled)).toBe(true);
  });

  it('rejects a selected provider disabled on PC after preview without changing mobile data', async () => {
    const data = snapshot(provider());
    await importSnapshot(data);
    const beforeProviders = await testDb.database.select().from(userProviderTable);
    const beforeModels = await testDb.database.select().from(userModelTable);
    data.providers[0]!.isEnabled = false;

    await expect(importSnapshot(data)).rejects.toMatchObject({
      details: { reason: 'invalid-selection' },
    });
    expect(await testDb.database.select().from(userProviderTable)).toEqual(beforeProviders);
    expect(await testDb.database.select().from(userModelTable)).toEqual(beforeModels);
  });

  it('syncs provider configuration without requiring any PC models', async () => {
    const data = snapshot(provider('relay', []));
    await expect(importSnapshot(data)).resolves.toEqual({
      providersAdded: 1,
      providersUpdated: 0,
      modelsAdded: 0,
      modelsSkipped: 0,
    });
    data.providers[0]!.apiKeys = [{ id: 'replacement', key: 'new-secret', isEnabled: true }];
    await expect(importSnapshot(data)).resolves.toEqual({
      providersAdded: 0,
      providersUpdated: 1,
      modelsAdded: 0,
      modelsSkipped: 0,
    });
    expect(await testDb.database.select().from(userProviderTable)).toMatchObject([
      { apiKeys: data.providers[0]!.apiKeys, isEnabled: true },
    ]);
  });

  it('does not delete models absent from the desktop snapshot', async () => {
    await importSnapshot(snapshot(provider('relay', ['mobile-only', 'shared'])));
    const before = await testDb.database.select().from(userModelTable);
    await importSnapshot(snapshot(provider('relay', ['shared'])));
    expect(await testDb.database.select().from(userModelTable)).toEqual(before);
  });

  it('validates new models against synced endpoints and rolls back the whole import', async () => {
    await importSnapshot(snapshot(provider()));
    const data = snapshot(
      provider('relay', ['missing']),
      provider('new-provider', ['unsupported']),
    );
    data.providers[1]!.models[0]!.endpointTypes = [ENDPOINT_TYPE.ANTHROPIC_MESSAGES];
    data.providers[0]!.apiKeys = [{ id: 'replacement', key: 'new-secret', isEnabled: true }];
    const beforeProviders = await testDb.database.select().from(userProviderTable);
    const beforeModels = await testDb.database.select().from(userModelTable);

    await expect(importSnapshot(data)).rejects.toThrow('Model endpoint configuration is invalid');
    expect(await testDb.database.select().from(userProviderTable)).toEqual(beforeProviders);
    expect(await testDb.database.select().from(userModelTable)).toEqual(beforeModels);
  });

  it('uses the PC endpoint configuration when adding models to an existing provider', async () => {
    await importSnapshot(snapshot(provider()));
    const data = snapshot(provider('relay', ['missing']));
    data.providers[0]!.models[0]!.endpointTypes = [ENDPOINT_TYPE.ANTHROPIC_MESSAGES];
    data.providers[0]!.defaultChatEndpoint = ENDPOINT_TYPE.ANTHROPIC_MESSAGES;
    data.providers[0]!.endpointConfigs = {
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://desktop.example.com' },
    };

    await expect(importSnapshot(data)).resolves.toMatchObject({
      providersUpdated: 1,
      modelsAdded: 1,
    });
    expect(await testDb.database.select().from(userProviderTable)).toMatchObject([
      {
        defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
        endpointConfigs: {
          [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://desktop.example.com' },
          [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://desktop.example.com/v1' },
        },
      },
    ]);
  });

  it('rejects invalid new custom provider configuration without writing rows', async () => {
    const data = snapshot(provider());
    data.providers[0]!.apiHost = undefined;
    await expect(importSnapshot(data)).rejects.toThrow(
      'Custom provider endpoint configuration is invalid',
    );
    expect(await testDb.database.select().from(userProviderTable)).toEqual([]);
  });

  it('preserves reasoning on newly imported preset-backed models', async () => {
    await importSnapshot(snapshot(provider('openai', ['gpt-5'])));
    const [model] = await testDb.database.select().from(userModelTable);
    expect(model).toMatchObject({ presetModelId: 'gpt-5', reasoning });
  });

  it('rechecks existing IDs inside serialized transactions for concurrent imports', async () => {
    const data = snapshot(provider());
    const results = await Promise.all([importSnapshot(data), importSnapshot(data)]);
    expect(results.map((result) => result.modelsAdded)).toEqual([1, 0]);
    expect(results.map((result) => result.providersAdded)).toEqual([1, 0]);
    expect(await testDb.database.select().from(userModelTable)).toHaveLength(1);
  });

  it('does not write for an aborted import or a removed connection', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(importSnapshot(snapshot(provider()), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await service.remove(connectionId);
    await expect(importSnapshot(snapshot(provider()))).rejects.toThrow();
    expect(await testDb.database.select().from(userProviderTable)).toEqual([]);
    expect(await testDb.database.select().from(desktopConnectionTable)).toEqual([]);
  });
});
