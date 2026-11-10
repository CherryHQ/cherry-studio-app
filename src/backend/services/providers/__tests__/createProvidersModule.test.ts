import { MobileRegistryLoader } from '@/backend/data/services/MobileRegistryLoader';
import { ProviderSetupError } from '@/shared/contracts';
import type { ApiKeyEntry, Provider } from '@/shared/data/types/provider';

import { createProvidersModule, type ProvidersModuleDependencies } from '../createProvidersModule';

let mockDeviceRegion: string | null = 'CN';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-CN', regionCode: mockDeviceRegion }],
}));

beforeEach(() => {
  mockDeviceRegion = 'CN';
});

function subject() {
  let provider = {
    id: 'custom',
    name: 'Custom',
    isEnabled: false,
    authType: 'api-key',
    defaultChatEndpoint: 'openai-chat-completions',
    endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://example.test/v1' } },
  } as Provider;
  const dependencies: ProvidersModuleDependencies = {
    getCountry: jest.fn(async () => 'US'),
    accounts: {
      getStatus: jest.fn(),
      begin: jest.fn(),
      signIn: jest.fn(),
      cancel: jest.fn(),
      receiveRedirect: jest.fn(),
      refresh: jest.fn(),
      getCapabilities: jest.fn(() => ({
        signIn: false,
        apiKeys: false,
        balance: false,
      })),
      logout: jest.fn(),
    },
    avatars: { persist: jest.fn(), remove: jest.fn(), resolve: jest.fn() },
    catalog: { isExcluded: () => false, list: () => [] },
    hasAvailableModels: jest.fn(async () => true),
    providers: {
      auth: async () => null,
      create: jest.fn(),
      find: jest.fn(),
      list: jest.fn(),
      get: async () => provider,
      keys: jest.fn(
        async (): Promise<ApiKeyEntry[]> => [{ id: 'key', key: 'configured', isEnabled: true }],
      ),
      enable: jest.fn(async () => {
        provider = { ...provider, isEnabled: true };
        return provider;
      }),
    },
    registryUpdates: {
      ensureReady: jest.fn(),
      apply: jest.fn(),
      subscribe: jest.fn(),
    },
  };
  return { backend: createProvidersModule(dependencies), dependencies };
}

describe('explicit provider activation', () => {
  it.each([
    { country: 'CN', deviceRegion: 'US', expected: ['deepseek'] },
    { country: 'US', deviceRegion: 'CN', expected: ['deepseek', 'openai'] },
    { country: null, deviceRegion: 'CN', expected: ['deepseek'] },
    { country: null, deviceRegion: 'US', expected: ['deepseek', 'openai'] },
    { country: null, deviceRegion: null, expected: ['deepseek'] },
  ])(
    'selects discovery from IP $country and device region $deviceRegion',
    async ({ country, deviceRegion, expected }) => {
      const { dependencies } = subject();
      dependencies.getCountry = async () => country;
      mockDeviceRegion = deviceRegion;
      dependencies.catalog.list = () =>
        [
          { id: 'deepseek', name: 'DeepSeek', availableInEditions: ['global', 'cn'] },
          { id: 'openai', name: 'OpenAI', availableInEditions: ['global'] },
        ] as ReturnType<ProvidersModuleDependencies['catalog']['list']>;
      jest.mocked(dependencies.providers.list).mockResolvedValue([]);
      const entries = await createProvidersModule(dependencies).listCatalog();
      expect(entries.map((entry) => entry.id)).toEqual(expected);
      expect(entries.every((entry) => entry.isRecommended)).toBe(true);
    },
  );

  it('keeps overseas discovery and imports available when detection leaves the country unknown', async () => {
    mockDeviceRegion = 'US';
    const { dependencies } = subject();
    dependencies.getCountry = async () => null;
    const loader = new MobileRegistryLoader();
    dependencies.catalog = {
      isExcluded: (id) => loader.isProviderExcludedFromCatalog(id),
      list: () => loader.loadProviders(),
    };
    jest.mocked(dependencies.providers.list).mockResolvedValue([]);
    const backend = createProvidersModule(dependencies);
    const ids = (await backend.listCatalog()).map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining(['openai', 'anthropic', 'gemini']));

    for (const id of ['openai', 'anthropic', 'gemini']) {
      const installed = { id, name: id, isEnabled: false } as Provider;
      jest.mocked(dependencies.providers.create).mockResolvedValueOnce(installed);
      await expect(backend.importPreset(id)).resolves.toBe(installed);
    }
  });

  it('exposes and imports international presets after detection changes to an overseas VPN exit', async () => {
    const { dependencies } = subject();
    jest.mocked(dependencies.getCountry).mockResolvedValueOnce('CN').mockResolvedValue('US');
    dependencies.catalog.list = () =>
      [
        { id: 'deepseek', name: 'DeepSeek', availableInEditions: ['global', 'cn'] },
        { id: 'openai', name: 'OpenAI', availableInEditions: ['global'] },
      ] as ReturnType<ProvidersModuleDependencies['catalog']['list']>;
    jest.mocked(dependencies.providers.list).mockResolvedValue([]);
    const installed = { id: 'openai', name: 'OpenAI', isEnabled: false } as Provider;
    jest.mocked(dependencies.providers.create).mockResolvedValue(installed);
    const backend = createProvidersModule(dependencies);

    expect((await backend.listCatalog()).map((entry) => entry.id)).toEqual(['deepseek']);
    expect((await backend.listCatalog()).map((entry) => entry.id)).toEqual(['deepseek', 'openai']);
    await expect(backend.importPreset('openai')).resolves.toBe(installed);
  });

  it('admits Kimi Code in China while retaining regional hiding for global-only presets', async () => {
    const { dependencies } = subject();
    dependencies.getCountry = async () => 'CN';
    const loader = new MobileRegistryLoader();
    dependencies.catalog = {
      isExcluded: (id) => loader.isProviderExcludedFromCatalog(id),
      list: () => loader.loadProviders(),
    };
    jest.mocked(dependencies.providers.list).mockResolvedValue([]);
    const ids = (await createProvidersModule(dependencies).listCatalog()).map((entry) => entry.id);
    expect(ids).toContain('kimi-coding');
    expect(ids).not.toContain('openai');
    expect(ids).not.toContain('github');
  });

  it('keeps an installed international provider usable after moving to China', async () => {
    const { dependencies } = subject();
    dependencies.getCountry = async () => 'CN';
    const installed = { id: 'openai', name: 'Saved OpenAI', isEnabled: true } as Provider;
    jest.mocked(dependencies.providers.find).mockResolvedValue(installed);
    const backend = createProvidersModule(dependencies);
    await expect(backend.importPreset('openai')).resolves.toBe(installed);
    expect(dependencies.providers.create).not.toHaveBeenCalled();
  });

  it.each(['CN', null])(
    'rejects a new international preset for country %s without writing provider data',
    async (country) => {
      const { dependencies } = subject();
      dependencies.getCountry = async () => country;
      dependencies.catalog.list = () =>
        [{ id: 'openai', name: 'OpenAI', availableInEditions: ['global'] }] as ReturnType<
          ProvidersModuleDependencies['catalog']['list']
        >;
      await expect(createProvidersModule(dependencies).importPreset('openai')).rejects.toThrow(
        'unavailable',
      );
      expect(dependencies.providers.create).not.toHaveBeenCalled();
    },
  );

  it('marks only enabled providers as enabled in the catalog', async () => {
    const { dependencies } = subject();
    dependencies.catalog.list = () =>
      [
        { id: 'deepseek', name: 'DeepSeek' },
        { id: 'openai', name: 'OpenAI' },
        { id: 'gemini', name: 'Gemini' },
      ] as ReturnType<ProvidersModuleDependencies['catalog']['list']>;
    jest
      .mocked(dependencies.providers.list)
      .mockResolvedValue([
        { id: 'deepseek', isEnabled: true } as Provider,
        { id: 'openai', isEnabled: false } as Provider,
      ]);
    const backend = createProvidersModule(dependencies);

    expect(await backend.listCatalog()).toEqual([
      expect.objectContaining({ id: 'deepseek', isEnabled: true, isInstalled: true }),
      expect.objectContaining({ id: 'openai', isEnabled: false, isInstalled: true }),
      expect.objectContaining({ id: 'gemini', isEnabled: false, isInstalled: false }),
    ]);
  });

  it('filters unavailable presets from setup and rejects direct imports before creating records', async () => {
    const { dependencies } = subject();
    const loader = new MobileRegistryLoader();
    dependencies.catalog = {
      isExcluded: (providerId) => loader.isProviderExcludedFromCatalog(providerId),
      list: () => loader.loadProviders(),
    };
    jest.mocked(dependencies.providers.list).mockResolvedValue([]);
    const backend = createProvidersModule(dependencies);
    const catalogIds = (await backend.listCatalog()).map(({ id }) => id);

    for (const providerId of [
      'grok-cli',
      'meta',
      'claude-code',
      'lmstudio',
      'ollama',
      'ovms',
      'new-api',
      'azure-openai',
      'aws-bedrock',
      'jina',
      'voyageai',
    ]) {
      expect(catalogIds).not.toContain(providerId);
      await expect(backend.importPreset(providerId)).rejects.toThrow(
        `Provider preset '${providerId}' is unavailable`,
      );
    }
    expect(dependencies.providers.create).not.toHaveBeenCalled();
    expect(catalogIds).toEqual(
      expect.arrayContaining([
        'openai',
        'anthropic',
        'gemini',
        'vertexai',
        'copilot',
        'openai-codex',
        'kimi-coding',
        'grok',
        'openrouter',
      ]),
    );
  });

  it('prepares without enabling, then enables a configured provider with local models', async () => {
    const { backend, dependencies } = subject();
    expect(await backend.getSetupStatus('custom')).toMatchObject({
      issue: null,
      hasModels: true,
      provider: { isEnabled: false },
    });
    expect(dependencies.providers.enable).not.toHaveBeenCalled();
    expect(await backend.enable('custom')).toMatchObject({ isEnabled: true });
    expect(dependencies.providers.enable).toHaveBeenCalledTimes(1);
    await backend.enable('custom');
    expect(dependencies.providers.enable).toHaveBeenCalledTimes(1);
  });

  it('rechecks credentials at completion and keeps the provider disabled', async () => {
    const { backend, dependencies } = subject();
    await backend.getSetupStatus('custom');
    jest.mocked(dependencies.providers.keys).mockResolvedValue([]);
    await expect(backend.enable('custom')).rejects.toEqual(
      new ProviderSetupError('missing-api-key'),
    );
    expect(dependencies.providers.enable).not.toHaveBeenCalled();
  });

  it('requires a usable local model and propagates persistence failures', async () => {
    const { backend, dependencies } = subject();
    jest.mocked(dependencies.hasAvailableModels).mockResolvedValue(false);
    await expect(backend.enable('custom')).rejects.toEqual(new ProviderSetupError('no-models'));
    expect(dependencies.providers.enable).not.toHaveBeenCalled();
    jest.mocked(dependencies.hasAvailableModels).mockResolvedValue(true);
    jest.mocked(dependencies.providers.enable).mockRejectedValue(new Error('storage unavailable'));
    await expect(backend.enable('custom')).rejects.toThrow('storage unavailable');
  });
});
