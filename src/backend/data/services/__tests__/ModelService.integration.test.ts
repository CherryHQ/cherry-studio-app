import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { createModelHandlers } from '@/backend/data/api/handlers/models';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';

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

  it.each(['create', 'batch', 'reconcile-dtos', 'reconcile-workflow'] as const)(
    'inherits the copied preset through %s and every read surface',
    async (path) => {
      const input = { modelId, providerId };
      if (path === 'create') await models.createFromRegistry(input);
      else if (path === 'batch') await models.createDtos([input]);
      else if (path === 'reconcile-dtos')
        await models.reconcileForProvider(providerId, { toAdd: [input], toRemove: [] });
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
