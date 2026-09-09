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

describe('DesktopConnectionService incremental import', () => {
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

  it('keeps every existing provider/model column and only appends missing models', async () => {
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

    expect(await service.preview(data)).toMatchObject({
      providers: [{ action: 'skip', models: [{ action: 'skip' }, { action: 'add' }] }],
    });
    await expect(importSnapshot(data)).resolves.toEqual({
      providersAdded: 0,
      providersSkipped: 1,
      modelsAdded: 1,
      modelsSkipped: 1,
    });
    expect(await testDb.database.select().from(userProviderTable)).toEqual([beforeProvider]);
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
      providersSkipped: 1,
      modelsAdded: 0,
      modelsSkipped: 2,
    });
    expect(await testDb.database.select().from(userModelTable)).toEqual(beforeRepeat);
  });

  it('does not delete models absent from the desktop snapshot', async () => {
    await importSnapshot(snapshot(provider('relay', ['mobile-only', 'shared'])));
    const before = await testDb.database.select().from(userModelTable);
    await importSnapshot(snapshot(provider('relay', ['shared'])));
    expect(await testDb.database.select().from(userModelTable)).toEqual(before);
  });

  it('validates new models against local endpoints and rolls back the whole import', async () => {
    await importSnapshot(snapshot(provider()));
    const data = snapshot(provider('new-provider'), provider('relay', ['unsupported']));
    data.providers[1]!.models[0]!.endpointTypes = [ENDPOINT_TYPE.ANTHROPIC_MESSAGES];
    // The incoming provider has that endpoint, but the existing mobile provider does not.
    data.providers[1]!.endpointConfigs = {
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://desktop.example.com' },
    };
    const beforeProviders = await testDb.database.select().from(userProviderTable);
    const beforeModels = await testDb.database.select().from(userModelTable);

    await expect(importSnapshot(data)).rejects.toThrow('Model endpoint configuration is invalid');
    expect(await testDb.database.select().from(userProviderTable)).toEqual(beforeProviders);
    expect(await testDb.database.select().from(userModelTable)).toEqual(beforeModels);
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
