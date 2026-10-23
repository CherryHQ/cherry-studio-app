import models from '@cherrystudio/provider-registry/data/models.json';
import providerModels from '@cherrystudio/provider-registry/data/provider-models.json';
import providers from '@cherrystudio/provider-registry/data/providers.json';

import {
  isCatalogManifestCompatible,
  MobileRegistryLoader,
  REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
  REGISTRY_SCHEMA_VERSION,
} from '../MobileRegistryLoader';

function downloadedLoader(): MobileRegistryLoader {
  const loader = new MobileRegistryLoader();
  loader.installRemoteSnapshot(loader.parseRemoteSnapshot({ models, providers, providerModels }));
  return loader;
}

const compatibleManifest = {
  files: {
    'models.json': 'models-version',
    'providers.json': 'providers-version',
    'provider-models.json': 'provider-models-version',
  },
  minAppVersion: REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
  revision: 1,
  schemaVersion: REGISTRY_SCHEMA_VERSION,
  sourceAppVersion: REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
};

describe('remote catalog compatibility', () => {
  it('accepts supported minimum versions, including older saved snapshots', () => {
    expect(isCatalogManifestCompatible(compatibleManifest)).toBe(true);
    expect(
      isCatalogManifestCompatible({
        ...compatibleManifest,
        minAppVersion: '2.0.8',
        sourceAppVersion: '2.0.8',
      }),
    ).toBe(true);
    expect(
      isCatalogManifestCompatible({
        ...compatibleManifest,
        minAppVersion: '2.0.9',
        sourceAppVersion: '2.0.14',
      }),
    ).toBe(true);
    expect(
      isCatalogManifestCompatible({
        ...compatibleManifest,
        minAppVersion: '2.1.5',
        sourceAppVersion: '2.1.5',
      }),
    ).toBe(false);
    expect(isCatalogManifestCompatible({ ...compatibleManifest, sourceAppVersion: '2.0.7' })).toBe(
      false,
    );
  });

  it('rejects another schema lane and malformed semantic versions', () => {
    expect(
      isCatalogManifestCompatible({
        ...compatibleManifest,
        schemaVersion: REGISTRY_SCHEMA_VERSION + 1,
      }),
    ).toBe(false);
    expect(isCatalogManifestCompatible({ ...compatibleManifest, minAppVersion: 'next' })).toBe(
      false,
    );
    expect(isCatalogManifestCompatible({ ...compatibleManifest, schemaVersion: 0 })).toBe(false);
  });

  it('admits v3 while keeping older cached schemas readable', () => {
    expect(REGISTRY_SCHEMA_VERSION).toBe(3);
    for (const schemaVersion of [1, 2, 3]) {
      expect(
        isCatalogManifestCompatible({
          ...compatibleManifest,
          minAppVersion: '2.1.4',
          sourceAppVersion: '2.1.6',
          schemaVersion,
        }),
      ).toBe(true);
    }
  });
});

describe('MobileRegistryLoader', () => {
  it('replaces provider definitions from the remote snapshot without retaining removed cloud presets', () => {
    const loader = downloadedLoader();
    const remoteProviders = {
      version: 'remote-providers',
      providers: [
        {
          id: 'cloud-provider',
          name: 'Cloud Provider',
          defaultChatEndpoint: 'openai-chat-completions',
          endpointConfigs: {
            'openai-chat-completions': { baseUrl: 'https://cloud.example/v1' },
          },
        },
      ],
    };
    loader.installRemoteSnapshot(
      loader.parseRemoteSnapshot({ models, providerModels, providers: remoteProviders }),
    );
    expect(loader.getProvidersVersion()).toBe('remote-providers');
    expect(loader.findProvider('openai')).toBeNull();
    expect(loader.findProvider('cloud-provider')).toMatchObject(remoteProviders.providers[0]);
    expect(loader.findProvider('kimi-coding')?.authMethods).toEqual(['oauth']);
  });

  it('rejects a missing or wholly incompatible provider payload before activating a snapshot', () => {
    const loader = downloadedLoader();
    for (const invalidProviders of [
      undefined,
      { version: 'empty', providers: [] },
      { version: 'invalid', providers: [{ id: 'missing-name' }] },
    ]) {
      expect(() =>
        loader.parseRemoteSnapshot({ models, providerModels, providers: invalidProviders }),
      ).toThrow();
    }
    expect(loader.findProvider('openai')).not.toBeNull();
  });

  it('requires a downloaded catalog for both provider lists and model reads', () => {
    const loader = new MobileRegistryLoader();
    expect(() => loader.loadProviders()).toThrow('not been downloaded');
    expect(loader.findProvider('openai')).toBeNull();
    expect(loader.isReady()).toBe(false);
    expect(() => loader.findModel('gpt-4o')).toThrow('not been downloaded');
    expect(() => loader.loadProviderModels()).toThrow('not been downloaded');
    loader.installRemoteSnapshot(loader.parseRemoteSnapshot({ models, providers, providerModels }));
    expect(loader.isReady()).toBe(true);
    loader.clearRemoteSnapshot();
    expect(() => loader.loadProviders()).toThrow('not been downloaded');
    expect(loader.findProvider('openai')).toBeNull();
    expect(() => loader.findModel('gpt-4o')).toThrow('not been downloaded');
  });

  it('preserves input-length pricing tiers at the remote schema boundary', () => {
    const loader = new MobileRegistryLoader();
    const tier = {
      minInputTokens: 272001,
      input: { perMillionTokens: 12 },
      output: { perMillionTokens: 60 },
      cacheRead: { perMillionTokens: 1.2 },
    };
    const snapshot = {
      providers,
      models: {
        version: 'tiered',
        models: [
          {
            id: 'tiered',
            name: 'Tiered',
            pricing: {
              input: { perMillionTokens: 6 },
              output: { perMillionTokens: 30 },
              inputTokenTiers: [tier],
            },
          },
        ],
      },
      providerModels: { version: 'tiered', overrides: [] },
    };
    loader.installRemoteSnapshot(loader.parseRemoteSnapshot(snapshot));
    expect(loader.findModel('tiered')?.pricing?.inputTokenTiers).toEqual([tier]);
    tier.minInputTokens = -1;
    loader.installRemoteSnapshot(loader.parseRemoteSnapshot(snapshot));
    expect(loader.findModel('tiered')).toBeNull();
  });

  it('reads GPT-6.1 Sol from v3 despite unknown vocabulary and incompatible sibling entries', () => {
    const loader = new MobileRegistryLoader();
    const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
    loader.installRemoteSnapshot(
      loader.parseRemoteSnapshot({
        providers,
        models: {
          version: 'v3-models',
          models: [
            {
              id: 'gpt-6-1-sol',
              name: 'GPT-6.1 Sol',
              capabilities: ['reasoning', 'future-capability'],
              reasoning: {
                controls: [
                  { kind: 'effort', values: [...efforts, 'future-effort'], default: 'medium' },
                ],
                supportedEfforts: [...efforts, 'future-effort'],
                defaultEffort: 'medium',
              },
            },
            { id: 'incompatible' },
            {
              id: 'unsupported-dialect',
              name: 'Unsupported',
              reasoning: { wireDialect: 'adaptive-between-tools' },
            },
          ],
        },
        providerModels: {
          version: 'v3-overrides',
          overrides: [
            {
              providerId: 'custom',
              modelId: 'gpt-6-1-sol',
              capabilities: { add: ['future-capability', 'function-call'] },
            },
            { providerId: 'broken' },
          ],
        },
      }),
    );
    expect(loader.findModel('incompatible')).toBeNull();
    expect(loader.findModel('unsupported-dialect')).toBeNull();
    expect(loader.findModel('gpt-6.1-sol')).toMatchObject({
      capabilities: ['reasoning'],
      reasoning: {
        controls: [{ kind: 'effort', values: efforts, default: 'medium' }],
        supportedEfforts: efforts,
      },
    });
    expect(loader.loadProviderModels()).toHaveLength(1);
    expect(loader.findOverride('custom', 'gpt-6.1-sol')?.capabilities?.add).toEqual([
      'function-call',
    ]);
  });

  it('omits models with unordered or mixed-currency pricing tiers without losing valid siblings', () => {
    const loader = new MobileRegistryLoader();
    const tier = {
      minInputTokens: 100,
      input: { perMillionTokens: 2, currency: 'USD' },
      output: { perMillionTokens: 4, currency: 'USD' },
    };
    for (const inputTokenTiers of [
      [tier, { ...tier, minInputTokens: 50 }],
      [{ ...tier, input: { perMillionTokens: 2, currency: 'CNY' } }],
    ]) {
      loader.installRemoteSnapshot(
        loader.parseRemoteSnapshot({
          providers,
          models: {
            version: 'v3',
            models: [
              { id: 'valid', name: 'Valid' },
              {
                id: 'invalid-pricing',
                name: 'Invalid',
                pricing: { input: tier.input, output: tier.output, inputTokenTiers },
              },
            ],
          },
          providerModels: { version: 'v3', overrides: [] },
        }),
      );
      expect(loader.findModel('valid')?.id).toBe('valid');
      expect(loader.findModel('invalid-pricing')).toBeNull();
    }
  });

  it('parses an explicitly downloaded desktop registry snapshot', () => {
    const loader = downloadedLoader();

    expect(loader.loadProviders().length).toBeGreaterThan(0);
    expect(loader.isReady()).toBe(true);
    expect(loader.findModel('gpt-4o')?.id).toBe('gpt-4o');
    expect(loader.loadProviderModels().length).toBeGreaterThan(0);
    expect(loader.getProviderModelsVersion()).toMatch(/^[a-f0-9]{16}$/);
  });

  it('resolves exact apiModelId before normalized fallback collisions', () => {
    const loader = downloadedLoader();

    expect(loader.findOverride('aws-bedrock', 'google.gemma-3-27b-it')).toMatchObject({
      apiModelId: 'google.gemma-3-27b-it',
      modelId: 'gemma-3-27b-it',
      providerId: 'aws-bedrock',
    });
  });

  it('keeps parameter-size siblings distinct for prefixed provider ids', () => {
    const loader = downloadedLoader();

    expect(loader.findModel('nvidia/gpt-oss-20b')?.id).toBe('gpt-oss-20b');
    expect(loader.findModel('nvidia/gpt-oss-120b')?.id).toBe('gpt-oss-120b');
    expect(loader.findOverride('nvidia', 'nvidia/gpt-oss-20b')?.modelId).toBe('gpt-oss-20b');
    expect(loader.findOverride('nvidia', 'nvidia/gpt-oss-120b')?.modelId).toBe('gpt-oss-120b');
  });

  it('does not resolve an unknown parameter size through a family sibling', () => {
    const loader = downloadedLoader();

    expect(loader.findModel('nvidia/gpt-oss-9b')).toBeNull();
    expect(loader.findOverride('nvidia', 'nvidia/gpt-oss-9b')).toBeNull();
  });

  it('exposes standalone provider-model rows', () => {
    const loader = new MobileRegistryLoader();
    loader.installRemoteSnapshot(
      loader.parseRemoteSnapshot({
        providers,
        models: { version: 'standalone', models: [] },
        providerModels: {
          version: 'standalone',
          overrides: [
            {
              providerId: '302ai',
              modelId: 'chatgpt-4o-latest',
              apiModelId: 'chatgpt-4o-latest',
              name: 'chatgpt-4o-latest',
            },
          ],
        },
      }),
    );
    expect(loader.findModel('chatgpt-4o-latest')).toBeNull();
    expect(loader.findOverride('302ai', 'chatgpt-4o-latest')?.name).toBe('chatgpt-4o-latest');
  });

  it('exposes provider metadata from the desktop catalog', () => {
    const loader = downloadedLoader();

    expect(loader.findProvider('tokenhub')).toMatchObject({
      id: 'tokenhub',
      name: 'TokenHub',
    });
  });

  it('excludes external CLI auth while admitting mobile OAuth presets', () => {
    const loader = downloadedLoader();
    const overrides = loader.loadProviderModels();

    expect(loader.getExcludedProviderIds()).toEqual(['grok-cli']);

    for (const providerId of ['grok-cli']) {
      expect(loader.isProviderExcluded(providerId)).toBe(true);
      expect(loader.isProviderExcludedFromCatalog(providerId)).toBe(true);
      expect(loader.findProvider(providerId)).toMatchObject({ authMethods: ['oauth'] });
      expect(overrides.some((override) => override.providerId === providerId)).toBe(true);
      expect(loader.getOverridesForProvider(providerId).length).toBeGreaterThan(0);
    }
    for (const providerId of ['copilot', 'openai-codex', 'kimi-coding']) {
      expect(loader.isProviderExcludedFromCatalog(providerId)).toBe(false);
      expect(loader.isProviderExcluded(providerId)).toBe(false);
      expect(loader.findProvider(providerId)?.authMethods).toContain('oauth');
    }
  });

  it('defaults Kimi Code to the protocol and endpoint used by its Pi OAuth models', () => {
    expect(downloadedLoader().findProvider('kimi-coding')).toMatchObject({
      authMethods: ['oauth'],
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': {
          adapterFamily: 'openai-compatible',
          baseUrl: 'https://api.kimi.com/coding/v1',
        },
      },
    });
  });

  it('keeps mixed api-key/OAuth providers selectable with their catalog metadata untouched', () => {
    const loader = downloadedLoader();

    for (const providerId of ['302ai', 'aihubmix', 'aionly', 'cherryin', 'ppio', 'silicon']) {
      expect(loader.isProviderExcluded(providerId)).toBe(false);
      expect(loader.isProviderExcludedFromCatalog(providerId)).toBe(false);
      expect(loader.findProvider(providerId)?.authMethods).toEqual(
        expect.arrayContaining(['api-key', 'oauth']),
      );
    }
  });

  it('hides unsupported setup presets without excluding saved providers or catalog metadata', () => {
    const loader = downloadedLoader();

    for (const providerId of [
      'meta',
      'claude-code',
      'lmstudio',
      'ollama',
      'ovms',
      'new-api',
      'litellm',
      'omlx',
      'comfyui',
      'azure-openai',
      'vertexai',
      'aws-bedrock',
      'jina',
      'voyageai',
    ]) {
      expect(loader.isProviderExcludedFromCatalog(providerId)).toBe(true);
      expect(loader.isProviderExcluded(providerId)).toBe(false);
      expect(loader.getExcludedProviderIds()).not.toContain(providerId);
      expect(loader.findProvider(providerId)).toMatchObject({ id: providerId });
    }
  });

  it('replaces all model metadata without a second bundled provider catalog', () => {
    const loader = downloadedLoader();
    expect(loader.getOverridesForProvider('openrouter').length).toBeGreaterThan(0);

    loader.installRemoteSnapshot(
      loader.parseRemoteSnapshot({
        providers,
        models: { models: [], version: 'remote-models' },
        providerModels: {
          overrides: [
            {
              apiModelId: 'remote-model',
              modelId: 'remote-model',
              providerId: 'openrouter',
            },
            {
              apiModelId: 'remote-only-mobile-extension',
              modelId: 'remote-only-mobile-extension',
              providerId: 'github',
            },
          ],
          version: 'remote-provider-models',
        },
      }),
    );

    expect(loader.getOverridesForProvider('github')).toHaveLength(1);
    expect(loader.findOverride('github', 'remote-only-mobile-extension')).toMatchObject({
      modelId: 'remote-only-mobile-extension',
      providerId: 'github',
    });
    expect(loader.findModel('gpt-4o')).toBeNull();
    expect(loader.findOverride('openrouter', 'remote-model')).toMatchObject({
      apiModelId: 'remote-model',
      providerId: 'openrouter',
    });
    expect(loader.getProviderModelsVersion()).toBe('remote-provider-models');
  });
});
