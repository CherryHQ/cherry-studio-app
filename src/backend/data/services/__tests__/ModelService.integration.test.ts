import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { createModelHandlers } from '@/backend/data/api/handlers/models';
import { subscribeDataApiChanges } from '@/backend/data/dataApiChanges';
import { agentTable } from '@/backend/data/db/schemas/agent';
import { userModelTable } from '@/backend/data/db/schemas/userModel';
import { userProviderTable } from '@/backend/data/db/schemas/userProvider';
import {
  installProviderRegistryTestSnapshot,
  providerRegistryTestSnapshot,
} from '@/backend/data/services/providerRegistryTestSnapshot';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import { LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';
import type { ModelOrderMove } from '@/shared/data/api/schemas/models';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { PreferenceService } from '../../PreferenceService';
import { ModelService } from '../ModelService';
import { providerRegistryService } from '../ProviderRegistryService';
import { ProviderService } from '../ProviderService';
import { createTestDb } from './_testDb';

const providerId = 'copied-302ai';
const modelId = 'served-name';
const pricing = { input: { perMillionTokens: 0.9 }, output: { perMillionTokens: 1.2 } };

function installCatalog(inputPrice = 0.9) {
  providerRegistryService.installRemoteSnapshot(
    providerRegistryService.parseRemoteSnapshot({
      models: {
        version: 'test',
        models: [
          {
            id: 'catalog-model',
            name: 'Base model',
            pricing: { input: { perMillionTokens: 0.1 }, output: { perMillionTokens: 0.2 } },
          },
        ],
      },
      providerModels: {
        version: 'test',
        overrides: [
          {
            providerId: '302ai',
            modelId: 'catalog-model',
            apiModelId: modelId,
            name: 'Provider model',
            pricing: { ...pricing, input: { perMillionTokens: inputPrice } },
            endpointTypes: ['openai-chat-completions'],
          },
        ],
      },
    }),
  );
}

describe('ModelService copied provider metadata', () => {
  let sqlite: DatabaseSync;
  let models: ModelService;

  beforeEach(async () => {
    installProviderRegistryTestSnapshot();
    installCatalog();
    sqlite = new DatabaseSync(':memory:');
    const db = createTestDb(sqlite);
    await installTestHost({
      DbService: db.dbService,
      PreferenceService: { get: jest.fn(async () => null) } as unknown as PreferenceService,
    });
    await new ProviderService().create({ name: 'Copy', providerId, presetProviderId: '302ai' });
    models = new ModelService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
    installProviderRegistryTestSnapshot();
  });

  it('persists a singleton move before another model', async () => {
    await models.createDtos(['a', 'b', 'c'].map((modelId) => ({ modelId, providerId })));
    await models.reorderBatch([
      {
        id: createUniqueModelId(providerId, 'c'),
        anchor: { before: createUniqueModelId(providerId, 'a') },
      },
    ]);
    expect(sqlite.prepare('SELECT model_id FROM user_model ORDER BY order_key').all()).toEqual([
      { model_id: 'c' },
      { model_id: 'a' },
      { model_id: 'b' },
    ]);
  });

  it.each(['create', 'batch', 'reconcile-workflow'] as const)(
    'inherits the copied preset through %s and every read surface',
    async (path) => {
      const input = { modelId, providerId };
      if (path === 'create') await models.createFromRegistry(input);
      else if (path === 'batch') await models.createDtos([input]);
      else await models.reconcileProviderModels(providerId, { toAdd: [input] });

      const expected = {
        id: `${providerId}::${modelId}`,
        providerId,
        modelId,
        apiModelId: modelId,
        presetModelId: 'catalog-model',
        name: 'Provider model',
        pricing,
      };
      await expect(models.getByKey(providerId, modelId)).resolves.toMatchObject(expected);
      await expect(models.getById(expected.id)).resolves.toMatchObject(expected);
      await expect(models.list({ providerId })).resolves.toEqual([
        expect.objectContaining(expected),
      ]);
      await expect(models.getNamesByUniqueIds([expected.id])).resolves.toEqual(
        new Map([[expected.id, 'Provider model']]),
      );
    },
  );

  it('compares edits against provider pricing and keeps explicit overrides across catalog updates', async () => {
    await models.createDtos([{ modelId, providerId }]);
    await models.update(providerId, modelId, { pricing });
    expect(sqlite.prepare('SELECT pricing FROM user_model').get()).toEqual({ pricing: null });
    installCatalog(1.5);
    await expect(models.getByKey(providerId, modelId)).resolves.toMatchObject({
      pricing: { input: { perMillionTokens: 1.5 } },
    });
    const customPrice = { ...pricing, input: { perMillionTokens: 5 } };
    await models.bulkUpdate([{ modelId, providerId, patch: { pricing: customPrice } }]);
    installCatalog(2);
    await expect(models.getByKey(providerId, modelId)).resolves.toMatchObject({
      pricing: customPrice,
    });
  });

  it('uses the preset identity through the model-add lookup endpoint', async () => {
    const handlers = createModelHandlers(models, { filter: async (candidates) => [...candidates] });
    const discovered = await handlers['/providers/:providerId/models:resolve'].GET({
      params: { providerId },
      query: { ids: [modelId] },
    });
    expect(discovered).toEqual([
      expect.objectContaining({
        providerId,
        apiModelId: modelId,
        presetModelId: 'catalog-model',
        name: 'Provider model',
        pricing,
      }),
    ]);
  });

  it('keeps provider-only image editing metadata on copied providers', async () => {
    installProviderRegistryTestSnapshot();
    const imageProviderId = 'copied-aihubmix';
    await new ProviderService().create({
      name: 'Images',
      providerId: imageProviderId,
      presetProviderId: 'aihubmix',
    });
    const imageModelId = 'ernie-irag-edit';
    await models.createFromRegistry({ providerId: imageProviderId, modelId: imageModelId });
    const model = await models.getByKey(imageProviderId, imageModelId);
    expect(model.imageGeneration?.modes.edit).toBeDefined();
    const handlers = createModelHandlers(models, { filter: async (candidates) => [...candidates] });
    await expect(
      handlers['/providers/:providerId/models/:modelId*/image-generation-support'].GET({
        params: { providerId: imageProviderId, modelId: imageModelId },
      }),
    ).resolves.toEqual(model.imageGeneration);
  });
});

describe('ModelService legacy MiMo identities', () => {
  const legacyModels = [
    ['mimo-v2-5', 'mimo-v2.5'],
    ['mimo-v2-5-pro', 'mimo-v2.5-pro'],
    ['mimo-v2-5-pro-ultraspeed', 'mimo-v2.5-pro-ultraspeed'],
    ['mimo-v2-6-flash', 'mimo-v2.6-flash'],
    ['mimo-v2-6-pro', 'mimo-v2.6-pro'],
    ['mimo-v2-6-pro-ultraspeed', 'mimo-v2.6-pro-ultraspeed'],
  ] as const;
  let sqlite: DatabaseSync;
  let db: ReturnType<typeof createTestDb>;
  let models: ModelService;

  beforeEach(async () => {
    installProviderRegistryTestSnapshot();
    sqlite = new DatabaseSync(':memory:');
    db = createTestDb(sqlite);
    await installTestHost({
      DbService: db.dbService,
      PreferenceService: { get: jest.fn(async () => null) } as unknown as PreferenceService,
    });
    models = new ModelService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
    installProviderRegistryTestSnapshot();
  });

  it.each([
    ['mimo', false],
    ['copied-mimo', false],
    ['mimo', true],
    ['copied-mimo', true],
  ] as const)(
    'corrects request IDs without rewriting %s records or Agent references (old catalog: %s)',
    async (providerId, oldCatalog) => {
      if (oldCatalog) {
        providerRegistryService.installRemoteSnapshot({
          ...providerRegistryTestSnapshot,
          providerModels: {
            ...providerRegistryTestSnapshot.providerModels,
            overrides: providerRegistryTestSnapshot.providerModels.overrides.map((override) =>
              override.providerId === 'mimo' ? { ...override, apiModelId: undefined } : override,
            ),
          },
        });
      }
      await new ProviderService().create({ name: 'MiMo', providerId, presetProviderId: 'mimo' });
      await models.createDtos(
        [...legacyModels.map(([id]) => id), 'mimo-v2.6-pro'].map((modelId) => ({
          modelId,
          providerId,
          name: `My ${modelId}`,
          maxOutputTokens: 8192,
        })),
      );
      const selectedId = createUniqueModelId(providerId, 'mimo-v2-6-pro');
      await db.database
        .insert(agentTable)
        .values({ name: 'MiMo Agent', model: selectedId, orderKey: 'a0' });
      const savedRows = sqlite.prepare('SELECT * FROM user_model ORDER BY id').all();
      const listed = await models.list({ providerId });

      for (const [modelId, apiModelId] of legacyModels) {
        const expected = {
          id: createUniqueModelId(providerId, modelId),
          providerId,
          modelId,
          apiModelId,
          presetModelId: modelId,
          name: `My ${modelId}`,
          maxOutputTokens: 8192,
        };
        const saved = await models.getByKey(providerId, modelId);
        expect(saved).toMatchObject(expected);
        await expect(models.getById(expected.id)).resolves.toMatchObject(expected);
        expect(listed).toContainEqual(expect.objectContaining(expected));
      }
      await expect(models.getByKey(providerId, 'mimo-v2.6-pro')).resolves.toMatchObject({
        id: createUniqueModelId(providerId, 'mimo-v2.6-pro'),
        modelId: 'mimo-v2.6-pro',
        apiModelId: 'mimo-v2.6-pro',
      });
      expect(sqlite.prepare('SELECT * FROM user_model ORDER BY id').all()).toEqual(savedRows);
      expect(sqlite.prepare('SELECT model FROM agent').get()).toEqual({ model: selectedId });
    },
  );

  it.each([
    ['custom-mimo', undefined, 'mimo-v2-6-pro'],
    ['mimo', 'mimo', null],
    ['mimo', 'mimo', 'mimo-v2-6-flash'],
  ] as const)(
    'preserves explicit aliases for %s with preset %s and model preset %s',
    async (providerId, presetProviderId, presetModelId) => {
      await new ProviderService().create({
        name: 'Custom alias',
        providerId,
        presetProviderId,
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://example.test/v1' },
        },
      });
      const modelId = 'mimo-v2-6-pro';
      await db.database.insert(userModelTable).values({
        id: createUniqueModelId(providerId, modelId),
        providerId,
        modelId,
        presetModelId,
        name: 'User alias',
        capabilities: [],
        supportsStreaming: true,
        orderKey: 'a0',
      });

      await expect(models.getByKey(providerId, modelId)).resolves.toMatchObject({
        modelId,
        apiModelId: modelId,
        name: 'User alias',
      });
    },
  );
});

describe('ModelService provider model ordering', () => {
  let sqlite: DatabaseSync;
  let db: ReturnType<typeof createTestDb>;
  let models: ModelService;
  let unsubscribe: (() => void) | undefined;
  let changed: jest.Mock;
  const id = (model: string, provider = 'p') => createUniqueModelId(provider, model);
  const snapshot = () => sqlite.prepare('SELECT * FROM user_model ORDER BY id').all();
  const orderedIds = (provider = 'p') =>
    sqlite
      .prepare('SELECT id FROM user_model WHERE provider_id = ? ORDER BY order_key')
      .all(provider)
      .map((row) => row.id);

  beforeEach(async () => {
    installProviderRegistryTestSnapshot();
    sqlite = new DatabaseSync(':memory:');
    db = createTestDb(sqlite);
    await installTestHost({
      DbService: db.dbService,
      PreferenceService: { get: jest.fn(async () => id('c')) } as unknown as PreferenceService,
    });
    for (const providerId of ['p', 'q', CLOUD_PROVIDER_ID]) {
      await db.database.insert(userProviderTable).values({
        providerId,
        name: providerId,
        orderKey: 'a0',
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://example.test/v1' } },
      });
      await db.database.insert(userModelTable).values(
        ['a', 'b', 'c', 'd'].map((modelId, index) => ({
          id: id(modelId, providerId),
          providerId,
          modelId,
          name: modelId,
          capabilities: [],
          supportsStreaming: true,
          orderKey: providerId === 'q' ? ['Zz', 'a0V', 'a1V', 'a4'][index] : `a${index}`,
          updatedAt: Date.now() + 100_000,
          isEnabled: modelId !== 'b',
        })),
      );
    }
    await db.database
      .insert(agentTable)
      .values({ name: 'Bound Agent', model: id('c'), orderKey: 'a0' });
    models = new ModelService();
    changed = jest.fn();
    unsubscribe = subscribeDataApiChanges(changed);
  });

  afterEach(async () => {
    unsubscribe?.();
    setActiveProfile(LOCAL_PROFILE);
    jest.restoreAllMocks();
    await uninstallTestHost();
    sqlite.close();
    installProviderRegistryTestSnapshot();
  });

  it.each([
    ['tail before head', 'd', { before: id('a') }, ['d', 'a', 'b', 'c']],
    ['head after middle', 'a', { after: id('b') }, ['b', 'a', 'c', 'd']],
    ['middle before middle', 'c', { before: id('b') }, ['a', 'c', 'b', 'd']],
    ['head after tail', 'a', { after: id('d') }, ['b', 'c', 'd', 'a']],
    ['default to first', 'c', { position: 'first' }, ['c', 'a', 'b', 'd']],
    ['disabled to last', 'b', { position: 'last' }, ['a', 'c', 'd', 'b']],
  ] as const)(
    'persists %s without changing other rows or bindings',
    async (_label, target, anchor, expected) => {
      const before = snapshot();
      const agentBefore = sqlite.prepare('SELECT * FROM agent').all();
      await models.reorderBatch([{ id: id(target), anchor }]);
      expect(orderedIds()).toEqual(expected.map((model) => id(model)));
      expect((await models.list({ providerId: 'p' })).map((model) => model.id)).toEqual(
        orderedIds(),
      );
      const after = snapshot();
      expect(after.filter((row) => row.id !== id(target))).toEqual(
        before.filter((row) => row.id !== id(target)),
      );
      const oldTarget = before.find((row) => row.id === id(target))!;
      const newTarget = after.find((row) => row.id === id(target))!;
      expect(newTarget.order_key).not.toBe(oldTarget.order_key);
      expect(Number(newTarget.updated_at)).toBeGreaterThan(Number(oldTarget.updated_at));
      expect(newTarget).toEqual({
        ...oldTarget,
        order_key: newTarget.order_key,
        updated_at: newTarget.updated_at,
      });
      expect(sqlite.prepare('SELECT * FROM agent').all()).toEqual(agentBefore);
      expect(changed.mock.calls).toEqual([[['/models', `/models/${id(target)}`]]]);
    },
  );

  it('applies a whole batch in sequence and publishes only the committed order', async () => {
    unsubscribe?.();
    changed.mockImplementation(() => {
      // A transaction opened by a subscriber can only start after COMMIT.
      sqlite.exec('BEGIN');
      try {
        return orderedIds();
      } finally {
        sqlite.exec('ROLLBACK');
      }
    });
    unsubscribe = subscribeDataApiChanges(changed);
    const transaction = jest.spyOn(db.dbService, 'withWriteTx');
    await models.reorderBatch([
      { id: id('c'), anchor: { position: 'first' } },
      { id: id('d'), anchor: { after: id('a') } },
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(changed).toHaveReturnedWith(['c', 'a', 'd', 'b'].map((model) => id(model)));
    expect(changed.mock.calls).toEqual([[['/models', `/models/${id('c')}`, `/models/${id('d')}`]]]);
    expect(orderedIds()).toEqual(['c', 'a', 'd', 'b'].map((model) => id(model)));
  });

  it('does nothing for an empty internal batch', async () => {
    const before = snapshot();
    const transaction = jest.spyOn(db.dbService, 'withWriteTx');
    await models.reorderBatch([]);
    expect(snapshot()).toEqual(before);
    expect(transaction).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    [
      'missing target',
      { id: id('missing'), anchor: { position: 'first' } },
      { code: 'NOT_FOUND', status: 404, details: { resource: 'user_model', id: id('missing') } },
    ],
    [
      'missing anchor',
      { id: id('b'), anchor: { before: id('missing') } },
      { code: 'NOT_FOUND', status: 404, details: { resource: 'user_model', id: id('missing') } },
    ],
    [
      'foreign before anchor',
      { id: id('b'), anchor: { before: id('a', 'q') } },
      { code: 'NOT_FOUND', status: 404, details: { resource: 'user_model', id: id('a', 'q') } },
    ],
    [
      'foreign after anchor',
      { id: id('b'), anchor: { after: id('a', 'q') } },
      { code: 'NOT_FOUND', status: 404, details: { resource: 'user_model', id: id('a', 'q') } },
    ],
    [
      'self before anchor',
      { id: id('b'), anchor: { before: id('b') } },
      {
        code: 'VALIDATION_ERROR',
        status: 422,
        details: { fieldErrors: { anchor: expect.any(Array) } },
      },
    ],
    [
      'self after anchor',
      { id: id('b'), anchor: { after: id('b') } },
      {
        code: 'VALIDATION_ERROR',
        status: 422,
        details: { fieldErrors: { anchor: expect.any(Array) } },
      },
    ],
    [
      'mixed providers',
      { id: id('b', 'q'), anchor: { position: 'last' } },
      {
        code: 'VALIDATION_ERROR',
        status: 422,
        details: { fieldErrors: { moves: expect.any(Array) } },
      },
    ],
    [
      'duplicate target',
      { id: id('c'), anchor: { position: 'last' } },
      {
        code: 'VALIDATION_ERROR',
        status: 422,
        details: { fieldErrors: { 'moves.1.id': expect.any(Array) } },
      },
    ],
    [
      'invalid target identity',
      { id: 'invalid', anchor: { position: 'last' } },
      {
        code: 'VALIDATION_ERROR',
        status: 422,
        details: { fieldErrors: { 'moves.1.id': expect.any(Array) } },
      },
    ],
    [
      'invalid anchor',
      { id: id('b'), anchor: {} },
      {
        code: 'VALIDATION_ERROR',
        status: 422,
        details: { fieldErrors: { 'moves.1.anchor': expect.any(Array) } },
      },
    ],
  ])(
    'rejects %s after a valid move without any saved change or publication',
    async (_label, invalid, error) => {
      const before = snapshot();
      await expect(
        models.reorderBatch([
          { id: id('c'), anchor: { position: 'first' } },
          invalid as ModelOrderMove,
        ]),
      ).rejects.toMatchObject(error);
      expect(snapshot()).toEqual(before);
      expect(orderedIds()).toEqual(['a', 'b', 'c', 'd'].map((model) => id(model)));
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it('rolls back all keys and timestamps when COMMIT fails', async () => {
    const before = snapshot();
    const failure = new Error('injected commit failure');
    db.failWriteTxCommit(failure);
    await expect(
      models.reorderBatch([
        { id: id('c'), anchor: { position: 'first' } },
        { id: id('a'), anchor: { position: 'last' } },
      ]),
    ).rejects.toBe(failure);
    expect(snapshot()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(['cloud', 'enterprise'])('enforces %s policy for direct calls', async (policy) => {
    const before = snapshot();
    if (policy === 'enterprise') {
      setActiveProfile({
        id: 'enterprise',
        address: 'https://enterprise.test',
        identity: { deployment: 'test', subject: 'user', authentication: 'password' },
      });
    }
    await expect(
      models.reorderBatch([
        {
          id: id('c', policy === 'cloud' ? CLOUD_PROVIDER_ID : 'p'),
          anchor: { position: 'first' },
        },
      ]),
    ).rejects.toMatchObject({
      code: 'INVALID_OPERATION',
      status: 400,
      details:
        policy === 'cloud'
          ? { operation: 'provider.edit', reason: 'managed by Cherry Cloud' }
          : { operation: 'model.reorderBatch', reason: 'managed by the enterprise server' },
    });
    expect(snapshot()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it('chunks large target lookups and commits all moves together', async () => {
    const inputs = Array.from({ length: 1001 }, (_, i) => ({
      providerId: 'p',
      modelId: `large-${i}`,
    }));
    await models.createDtos(inputs);
    const before = snapshot().filter((row) => row.provider_id !== 'p');
    const transaction = jest.spyOn(db.dbService, 'withWriteTx');
    await models.reorderBatch(
      inputs.map(({ modelId }) => ({ id: id(modelId), anchor: { position: 'first' } })),
    );
    expect(orderedIds()).toEqual([
      ...inputs.map(({ modelId }) => id(modelId)).toReversed(),
      ...['a', 'b', 'c', 'd'].map((model) => id(model)),
    ]);
    expect(snapshot().filter((row) => row.provider_id !== 'p')).toEqual(before);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('preserves saved ids and fractional keys after closing and reopening a file database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cherry-model-order-'));
    const path = join(directory, 'models.sqlite');
    let file: DatabaseSync | undefined = new DatabaseSync(path);
    try {
      const fileDb = createTestDb(file);
      await uninstallTestHost();
      await installTestHost({ DbService: fileDb.dbService });
      await new ProviderService().create({
        name: 'Persistent',
        providerId: 'p',
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://example.test/v1' } },
      });
      await models.createDtos(
        ['org/模型::a', 'b', 'c', 'd'].map((modelId) => ({ modelId, providerId: 'p' })),
      );
      await models.reorderBatch([
        { id: id('c'), anchor: { before: id('org/模型::a') } },
        { id: id('b'), anchor: { position: 'last' } },
      ]);
      const query = 'SELECT id, order_key FROM user_model ORDER BY provider_id, order_key';
      const saved = file.prepare(query).all();
      expect(saved.map((row) => row.id)).toEqual(
        ['c', 'org/模型::a', 'd', 'b'].map((model) => id(model)),
      );
      await uninstallTestHost();
      file.close();
      file = undefined;
      file = new DatabaseSync(path);
      // Read the already migrated database directly; never reapply its migrations.
      expect(file.prepare(query).all()).toEqual(saved);
    } finally {
      file?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
