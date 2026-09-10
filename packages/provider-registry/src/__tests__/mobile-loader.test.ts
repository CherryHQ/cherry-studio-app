import { describe, expect, it } from 'vitest';

import models from '../../data/models.json';
import providerModels from '../../data/provider-models.json';
import {
  isCatalogManifestCompatible,
  MobileRegistryLoader,
  REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
  REGISTRY_SCHEMA_VERSION,
} from '../mobile-loader';

function downloadedLoader(): MobileRegistryLoader {
  const loader = new MobileRegistryLoader();
  loader.installRemoteSnapshot(loader.parseRemoteSnapshot({ models, providerModels }));
  return loader;
}

const compatibleManifest = {
  files: {
    'models.json': 'models-version',
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
        minAppVersion: '2.0.15',
        sourceAppVersion: '2.0.15',
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
  });
});

describe('MobileRegistryLoader', () => {
  it('keeps trusted providers available but blocks model reads before download and after clearing', () => {
    const loader = new MobileRegistryLoader();
    expect(loader.loadProviders().length).toBeGreaterThan(0);
    expect(loader.isReady()).toBe(false);
    expect(() => loader.loadModels()).toThrow('not been downloaded');
    expect(() => loader.loadProviderModels()).toThrow('not been downloaded');
    loader.installRemoteSnapshot(loader.parseRemoteSnapshot({ models, providerModels }));
    expect(loader.isReady()).toBe(true);
    loader.clearRemoteSnapshot();
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
    expect(() => loader.parseRemoteSnapshot(snapshot)).toThrow();
  });

  it('parses an explicitly downloaded desktop registry snapshot', () => {
    const loader = downloadedLoader();

    expect(loader.loadProviders().length).toBeGreaterThan(0);
    expect(loader.loadModels().length).toBeGreaterThan(0);
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

  it('exposes standalone provider-model rows and image-generation metadata', () => {
    const loader = downloadedLoader();

    expect(loader.findOverride('302ai', 'chatgpt-4o-latest')).toMatchObject({
      apiModelId: 'chatgpt-4o-latest',
      modelId: 'chatgpt-4o-latest',
      name: 'chatgpt-4o-latest',
    });
    expect(loader.findModel('chatgpt-4o-latest')).toBeNull();
    expect(loader.findModel('qwen-image')?.imageGeneration).toBeDefined();
    expect(loader.findOverride('aihubmix', 'ernie-irag-edit')?.imageGeneration).toBeDefined();
  });

  it('exposes provider metadata from the desktop catalog', () => {
    const loader = downloadedLoader();

    expect(loader.findProvider('tokenhub')).toMatchObject({
      id: 'tokenhub',
      name: 'TokenHub',
    });
  });

  it('excludes preset providers whose only auth path is OAuth, without dropping their catalog rows', () => {
    const loader = downloadedLoader();
    const overrides = loader.loadProviderModels();

    expect(loader.getExcludedProviderIds()).toEqual(['copilot', 'grok-cli', 'openai-codex']);

    for (const providerId of ['copilot', 'grok-cli', 'openai-codex']) {
      expect(loader.isProviderExcluded(providerId)).toBe(true);
      expect(loader.isProviderExcludedFromCatalog(providerId)).toBe(true);
      expect(loader.findProvider(providerId)).toMatchObject({ authMethods: ['oauth'] });
      expect(overrides.some((override) => override.providerId === providerId)).toBe(true);
      expect(loader.getOverridesForProvider(providerId).length).toBeGreaterThan(0);
    }
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
      'claude-code',
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
    expect(loader.getOverridesForProvider('github').length).toBeGreaterThan(0);

    loader.installRemoteSnapshot(
      loader.parseRemoteSnapshot({
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
