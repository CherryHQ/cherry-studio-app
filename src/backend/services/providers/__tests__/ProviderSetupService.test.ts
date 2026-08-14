import { DatabaseSync } from 'node:sqlite';

import type {
  ConfigureBuiltinProviderInput,
  CreateCustomProviderInput,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import { createUniqueModelId, ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import type { ModelCatalogService } from '@/backend/services/models/ModelCatalogService';

import { ProviderSetupService } from '../ProviderSetupService';

const emptyModels = {
  manualModels: [],
  removedModelIds: [],
  selectedModelIds: [],
  skipModelPull: false,
};

function builtinInput(
  overrides: Partial<ConfigureBuiltinProviderInput> = {},
): ConfigureBuiltinProviderInput {
  return {
    apiKey: '',
    baseUrl: '',
    intent: 'configure-and-models',
    provider: 'CherryIN',
    ...emptyModels,
    ...overrides,
  };
}

function customInput(
  overrides: Partial<CreateCustomProviderInput> = {},
): CreateCustomProviderInput {
  return {
    anthropicUrl: '',
    apiKey: '',
    baseUrl: 'https://api.example.com/v1',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    geminiUrl: '',
    imageEditUrl: '',
    imageGenerationUrl: '',
    intent: 'configure-and-models',
    name: 'Example AI',
    openaiResponsesUrl: '',
    providerId: 'custom-example',
    ...emptyModels,
    ...overrides,
  };
}

describe('ProviderSetupService', () => {
  let testDb: TestDb;
  let sqlite: DatabaseSync;
  let catalogList: jest.MockedFunction<ModelCatalogService['list']>;
  let oauthGetStatus: jest.Mock;
  let providerConfigurationEnabled: boolean;
  let subject: ProviderSetupService;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    testDb = createTestDb(sqlite);
    catalogList = jest.fn(async (_input: Parameters<ModelCatalogService['list']>[0]) => ({
      models: [],
      remotelyProbed: true,
      source: 'api' as const,
    })) as jest.MockedFunction<ModelCatalogService['list']>;
    oauthGetStatus = jest.fn(async (providerId: string) => ({
      accountId: null,
      flowType: 'pkce-session' as const,
      isAuthenticated: false,
      isConfigured: true,
      providerId,
    }));
    providerConfigurationEnabled = true;
    await installTestHost({
      DbService: testDb.dbService,
      ModelCatalogService: { list: catalogList },
      ProviderOAuthService: { getStatus: oauthGetStatus },
      PreferenceService: {
        get: jest.fn(async (key: string) =>
          key === 'chat.tools.provider_configuration.enabled' ? providerConfigurationEnabled : null,
        ),
      },
    });
    subject = new ProviderSetupService();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await uninstallTestHost();
    sqlite.close();
  });

  async function seedBuiltin(
    input: {
      apiKey?: string;
      authType?: 'api-key' | 'iam-gcp';
      id?: string;
      name?: string;
    } = {},
  ) {
    const id = input.id ?? 'cherryin';
    return providerService.create({
      ...(input.apiKey
        ? { apiKeys: [{ id: 'existing-key', isEnabled: true, key: input.apiKey }] }
        : {}),
      authConfig:
        input.authType === 'iam-gcp'
          ? { location: 'global', project: 'project', type: 'iam-gcp' }
          : { type: 'api-key' },
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://old.example/v1' },
      },
      name: input.name ?? 'CherryIN',
      presetProviderId: id,
      providerId: id,
    });
  }

  test('matches normalized exact built-in ids and names without fuzzy matching', async () => {
    await seedBuiltin();

    await expect(subject.resolveBuiltin(' Cherry_IN ')).resolves.toMatchObject({
      provider: { id: 'cherryin', name: 'CherryIN' },
      status: 'matched',
    });
    await expect(subject.resolveBuiltin('Cherry')).resolves.toMatchObject({ status: 'not-found' });
  });

  test('returns candidates for ambiguous normalized names', async () => {
    await seedBuiltin({ id: 'first', name: 'Example AI' });
    await seedBuiltin({ id: 'second', name: 'example-ai' });

    await expect(subject.resolveBuiltin('example ai')).resolves.toEqual({
      candidates: [
        { id: 'first', name: 'Example AI' },
        { id: 'second', name: 'example-ai' },
      ],
      message: 'More than one built-in provider matches. Ask the user to choose one candidate.',
      status: 'ambiguous',
    });
  });

  test('lists redacted provider status without treating seeded built-ins as configured', async () => {
    await seedBuiltin({ apiKey: 'secret-key', id: 'cherryin', name: 'CherryIN' });
    await providerService.update('cherryin', { isEnabled: true });
    await seedBuiltin({ id: 'gemini', name: 'Gemini' });
    await seedBuiltin({ id: 'ollama', name: 'Ollama' });
    await providerService.create({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://private.example/v1' },
      },
      name: 'Private Relay',
      providerId: 'private-relay',
    });
    await modelService.createFromRegistry({
      capabilities: [],
      isEnabled: true,
      isHidden: false,
      modelId: 'configured-model',
      name: 'Configured model',
      providerId: 'cherryin',
      supportsStreaming: true,
    });

    const result = await subject.listProviders({ filter: 'all' });

    expect(result).toEqual({
      providers: [
        expect.objectContaining({
          authenticationStatus: 'ready',
          id: 'cherryin',
          isConfigured: true,
          isEnabled: true,
          kind: 'builtin',
          modelCount: 1,
          name: 'CherryIN',
        }),
        expect.objectContaining({
          authenticationStatus: 'missing',
          id: 'gemini',
          isConfigured: false,
          isEnabled: false,
          kind: 'builtin',
          modelCount: 0,
        }),
        expect.objectContaining({
          authenticationStatus: 'not-required',
          id: 'ollama',
          isConfigured: false,
          kind: 'builtin',
        }),
        expect.objectContaining({
          authenticationStatus: 'missing',
          id: 'private-relay',
          isConfigured: true,
          isEnabled: false,
          kind: 'custom',
        }),
      ],
      status: 'ok',
    });
    expect(JSON.stringify(result)).not.toContain('secret-key');
    expect(JSON.stringify(result)).not.toContain('private.example');
  });

  test('filters provider discovery by configured, enabled, built-in, and custom status', async () => {
    await seedBuiltin({ id: 'gemini', name: 'Gemini' });
    await seedBuiltin({ id: 'openai', name: 'OpenAI' });
    await providerService.update('openai', { isEnabled: true });
    await providerService.create({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://relay.example/v1' },
      },
      name: 'Relay',
      providerId: 'relay',
    });

    await expect(subject.listProviders({ filter: 'configured' })).resolves.toMatchObject({
      providers: [{ id: 'openai' }, { id: 'relay' }],
    });
    await expect(subject.listProviders({ filter: 'enabled' })).resolves.toMatchObject({
      providers: [{ id: 'openai' }],
    });
    await expect(subject.listProviders({ filter: 'builtin' })).resolves.toMatchObject({
      providers: [{ id: 'gemini' }, { id: 'openai' }],
    });
    await expect(subject.listProviders({ filter: 'custom' })).resolves.toMatchObject({
      providers: [{ id: 'relay' }],
    });
  });

  test('uses OAuth state without exposing account details and rechecks the tool preference', async () => {
    await seedBuiltin({ id: 'cherryin', name: 'CherryIN' });
    oauthGetStatus.mockResolvedValueOnce({
      accountId: 'private-account',
      flowType: 'pkce-session',
      isAuthenticated: true,
      isConfigured: true,
      providerId: 'cherryin',
    });

    const configured = await subject.listProviders({ filter: 'configured' });
    expect(configured).toEqual({
      providers: [
        expect.objectContaining({
          authenticationStatus: 'ready',
          id: 'cherryin',
          isConfigured: true,
        }),
      ],
      status: 'ok',
    });
    expect(JSON.stringify(configured)).not.toContain('private-account');

    providerConfigurationEnabled = false;
    await expect(subject.listProviders({ filter: 'all' })).resolves.toEqual({
      providers: [],
      status: 'disabled',
    });
  });

  test('distinguishes unavailable OAuth from external credentials the app cannot inspect', async () => {
    await seedBuiltin({ id: 'openai-codex', name: 'OpenAI Codex' });
    await seedBuiltin({ id: 'claude-code', name: 'Claude Code' });
    oauthGetStatus.mockImplementation(async (providerId: string) => ({
      accountId: null,
      flowType: 'blocked' as const,
      isAuthenticated: false,
      isConfigured: false,
      providerId,
    }));

    await expect(subject.listProviders({ filter: 'all' })).resolves.toMatchObject({
      providers: [
        { authenticationStatus: 'unavailable', id: 'openai-codex' },
        { authenticationStatus: 'unknown', id: 'claude-code' },
      ],
    });
  });

  test('previews a transient key and endpoint without writing provider state', async () => {
    await seedBuiltin({ apiKey: 'existing' });
    const input = builtinInput({
      apiKey: 'draft-key',
      baseUrl: 'https://draft.example/v1',
    });
    catalogList.mockImplementationOnce(async (catalogInput) => {
      const baseUrl =
        catalogInput.provider.endpointConfigs?.[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]?.baseUrl;
      if (catalogInput.apiKey !== 'draft-key' || baseUrl !== 'https://draft.example/v1') {
        throw new Error('preview did not use the transient provider configuration');
      }
      return { models: [], remotelyProbed: true, source: 'api' };
    });

    await expect(subject.previewBuiltin(input)).resolves.toMatchObject({
      apiKeyCount: 1,
      apiKeyWillBeAdded: true,
      catalogSource: 'api',
      origin: 'https://draft.example',
      provider: { endpointConfigs: expect.any(Object), isEnabled: false },
    });
    await expect(providerService.getByProviderId('cherryin')).resolves.toMatchObject({
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: expect.objectContaining({
          baseUrl: 'https://old.example/v1',
        }),
      },
      isEnabled: false,
    });
    await expect(providerService.listApiKeys('cherryin')).resolves.toEqual({
      keys: [{ id: 'existing-key', isEnabled: true, key: 'existing' }],
    });
  });

  test('returns a saveable preview when the transient catalog request fails', async () => {
    await seedBuiltin();
    catalogList.mockRejectedValueOnce(new Error('offline'));

    await expect(subject.previewBuiltin(builtinInput())).resolves.toMatchObject({
      catalogError: 'offline',
      catalogSource: 'skipped',
      models: { added: [], missing: [] },
      remotelyProbed: false,
    });
  });

  test('keeps manual model drafts out of catalog selections', async () => {
    await seedBuiltin();
    const remote = {
      capabilities: [],
      id: createUniqueModelId('cherryin', 'manual-model'),
      isDeprecated: false,
      isEnabled: true,
      isHidden: false,
      modelId: 'manual-model',
      name: 'Manual model',
      providerId: 'cherryin',
      supportsStreaming: true,
    };
    catalogList.mockResolvedValueOnce({ models: [remote], remotelyProbed: true, source: 'api' });

    await expect(
      subject.previewBuiltin(
        builtinInput({
          manualModels: [
            {
              contextWindow: 0,
              endpointTypes: [],
              group: '',
              maxInputTokens: 0,
              maxOutputTokens: 0,
              modelId: 'manual-model',
              name: '',
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({
      defaultSelectedModelIds: [],
      models: { added: [] },
    });
  });

  test('previews a custom provider with explicit transient auth and no stored fallback', async () => {
    const input = customInput({ apiKey: 'draft-key', providerId: 'custom-transient' });
    catalogList.mockImplementationOnce(async (catalogInput) => {
      const baseUrl =
        catalogInput.provider.endpointConfigs?.[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]?.baseUrl;
      if (
        catalogInput.apiKey !== 'draft-key' ||
        catalogInput.authConfig?.type !== 'api-key' ||
        catalogInput.provider.id !== 'custom-transient' ||
        baseUrl !== 'https://api.example.com'
      ) {
        throw new Error('preview did not use the transient custom provider configuration');
      }
      return { models: [], remotelyProbed: true, source: 'api' };
    });

    await expect(subject.previewCustom(input)).resolves.toMatchObject({
      apiKeyCount: 0,
      apiKeyWillBeAdded: true,
      catalogSource: 'api',
      provider: { id: 'custom-transient', isEnabled: false },
    });
    await expect(providerService.getByProviderId('custom-transient')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('appends and deduplicates keys, enables the provider, and is idempotent', async () => {
    await seedBuiltin({ apiKey: 'existing' });
    const remote = {
      capabilities: [],
      id: createUniqueModelId('cherryin', 'new-model'),
      isDeprecated: false,
      isEnabled: true,
      isHidden: false,
      modelId: 'new-model',
      name: 'New model',
      providerId: 'cherryin',
      supportsStreaming: true,
    };
    catalogList.mockResolvedValue({ models: [remote], remotelyProbed: true, source: 'api' });
    const input = builtinInput({
      apiKey: 'new-key',
      selectedModelIds: [remote.id],
    });

    await expect(subject.executeBuiltin(input)).resolves.toMatchObject({
      apiKeyAdded: true,
      modelsAdded: [remote.id],
      providerId: 'cherryin',
      status: 'configured',
    });
    await expect(subject.executeBuiltin(input)).resolves.toMatchObject({
      apiKeyAdded: false,
      modelsAdded: [],
      status: 'configured',
    });
    await expect(providerService.getByProviderId('cherryin')).resolves.toMatchObject({
      isEnabled: true,
    });
    await expect(providerService.listApiKeys('cherryin')).resolves.toMatchObject({
      keys: [
        expect.objectContaining({ key: 'existing' }),
        expect.objectContaining({ key: 'new-key' }),
      ],
    });
    await expect(modelService.list({ providerId: 'cherryin' })).resolves.toEqual([
      expect.objectContaining({ id: remote.id }),
    ]);
  });

  test('revalidates catalog selections at execution time', async () => {
    await seedBuiltin();
    const staleModelId = createUniqueModelId('cherryin', 'stale-model');

    await expect(
      subject.executeBuiltin(builtinInput({ selectedModelIds: [staleModelId] })),
    ).resolves.toMatchObject({
      modelsAdded: [],
      modelsSkipped: [staleModelId],
      status: 'configured',
    });
    await expect(modelService.list({ providerId: 'cherryin' })).resolves.toEqual([]);
  });

  test('rolls back provider changes when model reconciliation fails', async () => {
    await seedBuiltin();
    jest
      .spyOn(modelService, 'reconcileProviderModelsTx')
      .mockRejectedValueOnce(new Error('write failed'));

    await expect(subject.executeBuiltin(builtinInput({ apiKey: 'new-key' }))).rejects.toThrow(
      'write failed',
    );
    await expect(providerService.getByProviderId('cherryin')).resolves.toMatchObject({
      isEnabled: false,
    });
    await expect(providerService.listApiKeys('cherryin')).resolves.toEqual({ keys: [] });
  });

  test('saves provider configuration but skips removals after catalog failure', async () => {
    await seedBuiltin();
    await modelService.createFromRegistry({
      capabilities: [],
      isEnabled: true,
      isHidden: false,
      modelId: 'old',
      name: 'Old model',
      providerId: 'cherryin',
      supportsStreaming: true,
    });
    catalogList.mockRejectedValueOnce(new Error('offline'));

    await expect(
      subject.executeBuiltin(
        builtinInput({ removedModelIds: [createUniqueModelId('cherryin', 'old')] }),
      ),
    ).resolves.toMatchObject({ catalogSource: 'skipped', status: 'configured' });
    await expect(modelService.list({ providerId: 'cherryin' })).resolves.toEqual([
      expect.objectContaining({ modelId: 'old', providerId: 'cherryin' }),
    ]);
    await expect(providerService.getByProviderId('cherryin')).resolves.toMatchObject({
      isEnabled: true,
    });
  });

  test('re-adds a selected model when the same catalog refresh removes it first', async () => {
    await seedBuiltin();
    const modelId = createUniqueModelId('cherryin', 'deepseek-chat');
    await modelService.createFromRegistry({
      capabilities: [],
      isEnabled: true,
      isHidden: false,
      modelId: 'deepseek-chat',
      name: 'Old model',
      providerId: 'cherryin',
      supportsStreaming: true,
    });
    catalogList.mockResolvedValueOnce({ models: [], remotelyProbed: true, source: 'api' });

    await expect(
      subject.executeBuiltin(
        builtinInput({
          manualModels: [
            {
              contextWindow: 0,
              endpointTypes: [],
              group: '',
              maxInputTokens: 0,
              maxOutputTokens: 0,
              modelId: 'deepseek-chat',
              name: 'Refreshed model',
            },
          ],
          removedModelIds: [modelId],
        }),
      ),
    ).resolves.toMatchObject({ modelsAdded: [modelId], modelsRemoved: [modelId] });
    await expect(modelService.list({ providerId: 'cherryin' })).resolves.toEqual([
      expect.objectContaining({ id: modelId, name: 'Refreshed model' }),
    ]);
  });

  test('rejects a URL override for providers whose endpoint is not editable', async () => {
    await seedBuiltin({ authType: 'iam-gcp', id: 'vertexai', name: 'Vertex AI' });

    await expect(
      subject.executeBuiltin(
        builtinInput({ baseUrl: 'https://override.example', provider: 'vertexai' }),
      ),
    ).resolves.toMatchObject({ status: 'invalid' });
    await expect(providerService.getByProviderId('vertexai')).resolves.toMatchObject({
      isEnabled: false,
    });
  });

  test('rejects duplicate custom names but allows the same URL under distinct names', async () => {
    await expect(subject.executeCustom(customInput())).resolves.toMatchObject({
      providerId: 'custom-example',
      status: 'configured',
    });
    await expect(
      subject.executeCustom(customInput({ name: ' example ai ', providerId: 'other-id' })),
    ).resolves.toMatchObject({ status: 'invalid' });
    await expect(
      subject.executeCustom(customInput({ name: 'Second AI', providerId: 'custom-second' })),
    ).resolves.toMatchObject({ providerId: 'custom-second', status: 'configured' });
  });

  test('retries the same generated custom provider idempotently', async () => {
    const input = customInput({ apiKey: 'new-key' });

    await expect(subject.executeCustom(input)).resolves.toMatchObject({
      apiKeyAdded: true,
      providerId: 'custom-example',
      status: 'configured',
    });
    await expect(subject.executeCustom(input)).resolves.toMatchObject({
      apiKeyAdded: false,
      modelsAdded: [],
      providerId: 'custom-example',
      status: 'configured',
    });
    await expect(providerService.listApiKeys('custom-example')).resolves.toMatchObject({
      keys: [expect.objectContaining({ key: 'new-key' })],
    });
    await expect(providerService.getByProviderId('custom-example')).resolves.toMatchObject({
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: expect.objectContaining({
          baseUrl: 'https://api.example.com',
        }),
      },
    });
  });

  test('rolls back custom provider creation when model reconciliation fails', async () => {
    jest
      .spyOn(modelService, 'reconcileProviderModelsTx')
      .mockRejectedValueOnce(new Error('write failed'));

    await expect(subject.executeCustom(customInput({ apiKey: 'new-key' }))).resolves.toMatchObject({
      message: 'write failed',
      status: 'invalid',
    });
    await expect(providerService.getByProviderId('custom-example')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('does not overwrite a custom provider id claimed during catalog loading', async () => {
    catalogList.mockImplementationOnce(async () => {
      await providerService.create({
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://other.example/v1' },
        },
        name: 'Other AI',
        providerId: 'custom-race',
      });
      return { models: [], remotelyProbed: true, source: 'api' };
    });

    await expect(
      subject.executeCustom(customInput({ providerId: 'custom-race' })),
    ).resolves.toMatchObject({ status: 'invalid' });
    await expect(providerService.getByProviderId('custom-race')).resolves.toMatchObject({
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: expect.objectContaining({
          baseUrl: 'https://other.example/v1',
        }),
      },
      name: 'Other AI',
    });
  });

  test('fails closed when the global preference is disabled', async () => {
    await seedBuiltin();
    await installTestHost({
      DbService: testDb.dbService,
      ModelCatalogService: { list: catalogList },
      PreferenceService: { get: jest.fn(async () => false) },
    });

    await expect(subject.executeBuiltin(builtinInput())).resolves.toMatchObject({
      status: 'disabled',
    });
  });
});
