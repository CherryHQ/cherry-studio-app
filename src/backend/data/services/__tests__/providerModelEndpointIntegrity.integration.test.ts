import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { ModelService } from '../ModelService';
import { ProviderService } from '../ProviderService';
import { createTestDb, type TestDb } from './_testDb';

describe('custom provider model endpoint integrity', () => {
  let sqlite: DatabaseSync;
  let db: TestDb;
  let models: ModelService;
  let providers: ProviderService;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    db = createTestDb(sqlite);
    await installTestHost({ DbService: db.dbService });
    models = new ModelService();
    providers = new ProviderService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  it('blocks deleting an endpoint referenced by a disabled hidden model', async () => {
    await createProvider('provider-a');
    await models.create({
      endpointTypes: ['anthropic-messages'],
      isEnabled: false,
      isHidden: true,
      modelId: 'claude',
      providerId: 'provider-a',
    });

    await expect(removeAnthropicEndpoint('provider-a')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(providers.getByProviderId('provider-a')).resolves.toMatchObject({
      endpointConfigs: {
        'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
      },
    });
  });

  it('lets implicit models follow a valid new default', async () => {
    await createProvider('provider-b');
    await models.create({ endpointTypes: [], modelId: 'default-model', providerId: 'provider-b' });

    await expect(
      providers.update('provider-b', {
        defaultChatEndpoint: 'anthropic-messages',
        endpointConfigs: {
          'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
        },
      }),
    ).resolves.toMatchObject({ defaultChatEndpoint: 'anthropic-messages' });
  });

  it('rejects a model endpoint write after the provider endpoint was removed', async () => {
    await createProvider('provider-c');
    await models.create({
      endpointTypes: ['openai-chat-completions'],
      modelId: 'model',
      providerId: 'provider-c',
    });
    await removeAnthropicEndpoint('provider-c');

    await expect(
      models.update('provider-c', 'model', { endpointTypes: ['anthropic-messages'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('validates batch, bulk, and reconcile endpoint writes inside their transactions', async () => {
    await createProvider('provider-d');
    await removeAnthropicEndpoint('provider-d');

    await expect(
      models.batchCreate([
        {
          endpointTypes: ['anthropic-messages'],
          modelId: 'batch-model',
          providerId: 'provider-d',
        },
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await models.create({
      endpointTypes: ['openai-chat-completions'],
      modelId: 'existing-model',
      providerId: 'provider-d',
    });
    await expect(
      models.bulkUpdate([
        {
          modelId: 'existing-model',
          patch: { endpointTypes: ['anthropic-messages'] },
          providerId: 'provider-d',
        },
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      models.reconcileProviderModels('provider-d', {
        toAdd: [
          {
            endpointTypes: ['anthropic-messages'],
            modelId: 'reconciled-model',
            providerId: 'provider-d',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires a configured Pi text default when custom endpoint settings are written', async () => {
    await expect(
      providers.create({
        defaultChatEndpoint: 'openai-responses',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://openai.example.com/v1' },
        },
        name: 'Invalid provider',
        providerId: 'invalid-provider',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await createProvider('provider-e');
    await expect(
      providers.update('provider-e', {
        defaultChatEndpoint: 'openai-responses',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('retains unsupported endpoint values across unrelated updates', async () => {
    await createProvider('provider-f');
    await models.create({
      endpointTypes: ['ollama-chat'],
      modelId: 'legacy-model',
      providerId: 'provider-f',
    });

    await providers.update('provider-f', { name: 'Renamed provider' });
    await models.update('provider-f', 'legacy-model', { name: 'Renamed model' });

    await expect(models.getByKey('provider-f', 'legacy-model')).resolves.toMatchObject({
      endpointTypes: ['ollama-chat'],
      name: 'Renamed model',
    });
  });

  it.each(['provider-first', 'model-first'] as const)(
    'serializes interleaved endpoint removal and model selection: %s',
    async (order) => {
      const providerId = `race-${order}`;
      await createProvider(providerId);
      await models.create({
        endpointTypes: ['openai-chat-completions'],
        modelId: 'model',
        providerId,
      });

      const providerWrite = () => removeAnthropicEndpoint(providerId);
      const modelWrite = () =>
        models.update(providerId, 'model', { endpointTypes: ['anthropic-messages'] });
      const results = await Promise.allSettled(
        order === 'provider-first'
          ? [providerWrite(), modelWrite()]
          : [modelWrite(), providerWrite()],
      );

      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const [provider, model] = await Promise.all([
        providers.getByProviderId(providerId),
        models.getByKey(providerId, 'model'),
      ]);
      const explicitEndpoint = model.endpointTypes?.[0];
      expect(
        explicitEndpoint ? provider.endpointConfigs?.[explicitEndpoint]?.baseUrl : undefined,
      ).toBeTruthy();
    },
  );

  async function createProvider(providerId: string) {
    await providers.create({
      authConfig: { type: 'api-key' },
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
        'openai-chat-completions': { baseUrl: 'https://openai.example.com/v1' },
      },
      name: providerId,
      providerId,
    });
  }

  async function removeAnthropicEndpoint(providerId: string) {
    return providers.update(providerId, {
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://openai.example.com/v1' },
      },
    });
  }
});
