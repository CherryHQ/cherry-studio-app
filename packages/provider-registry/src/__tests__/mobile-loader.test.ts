import { describe, expect, it } from 'vitest';

import {
  isCatalogManifestCompatible,
  MobileRegistryLoader,
  REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
  REGISTRY_SCHEMA_VERSION,
} from '../mobile-loader';

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
  it('accepts only the inclusive Desktop semantic range implemented by Mobile', () => {
    expect(isCatalogManifestCompatible(compatibleManifest)).toBe(true);
    expect(isCatalogManifestCompatible({ ...compatibleManifest, minAppVersion: '2.0.9' })).toBe(
      false,
    );
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
  it('parses the bundled desktop registry JSON', () => {
    const loader = new MobileRegistryLoader();

    expect(loader.loadProviders().length).toBeGreaterThan(0);
    expect(loader.loadModels().length).toBeGreaterThan(0);
    expect(loader.loadProviderModels().length).toBeGreaterThan(0);
    expect(loader.getProviderModelsVersion()).toMatch(/^[a-f0-9]{16}$/);
  });

  it('resolves exact apiModelId before normalized fallback collisions', () => {
    const loader = new MobileRegistryLoader();

    expect(loader.findOverride('aws-bedrock', 'google.gemma-3-27b-it')).toMatchObject({
      apiModelId: 'google.gemma-3-27b-it',
      modelId: 'gemma-3-27b-it',
      providerId: 'aws-bedrock',
    });
  });

  it('keeps parameter-size siblings distinct for prefixed provider ids', () => {
    const loader = new MobileRegistryLoader();

    expect(loader.findModel('nvidia/gpt-oss-20b')?.id).toBe('gpt-oss-20b');
    expect(loader.findModel('nvidia/gpt-oss-120b')?.id).toBe('gpt-oss-120b');
    expect(loader.findOverride('nvidia', 'nvidia/gpt-oss-20b')?.modelId).toBe('gpt-oss-20b');
    expect(loader.findOverride('nvidia', 'nvidia/gpt-oss-120b')?.modelId).toBe('gpt-oss-120b');
  });

  it('does not resolve an unknown parameter size through a family sibling', () => {
    const loader = new MobileRegistryLoader();

    expect(loader.findModel('nvidia/gpt-oss-9b')).toBeNull();
    expect(loader.findOverride('nvidia', 'nvidia/gpt-oss-9b')).toBeNull();
  });

  it('exposes standalone provider-model rows and image-generation metadata', () => {
    const loader = new MobileRegistryLoader();

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
    const loader = new MobileRegistryLoader();

    expect(loader.findProvider('tokenhub')).toMatchObject({
      id: 'tokenhub',
      name: 'TokenHub',
    });
  });

  it('excludes preset providers whose only auth path is OAuth, without dropping their catalog rows', () => {
    const loader = new MobileRegistryLoader();
    const overrides = loader.loadProviderModels();

    expect(loader.getExcludedProviderIds()).toEqual(['copilot', 'grok-cli', 'openai-codex']);

    for (const providerId of ['copilot', 'grok-cli', 'openai-codex']) {
      expect(loader.isProviderExcluded(providerId)).toBe(true);
      expect(loader.findProvider(providerId)).toMatchObject({ authMethods: ['oauth'] });
      expect(overrides.some((override) => override.providerId === providerId)).toBe(true);
      expect(loader.getOverridesForProvider(providerId).length).toBeGreaterThan(0);
    }
  });

  it('keeps mixed api-key/OAuth providers selectable with their catalog metadata untouched', () => {
    const loader = new MobileRegistryLoader();

    for (const providerId of ['302ai', 'aihubmix', 'aionly', 'cherryin', 'ppio', 'silicon']) {
      expect(loader.isProviderExcluded(providerId)).toBe(false);
      expect(loader.findProvider(providerId)?.authMethods).toEqual(
        expect.arrayContaining(['api-key', 'oauth']),
      );
    }
  });

  it('overlays Mobile-only provider overrides onto a remote Desktop snapshot', () => {
    const loader = new MobileRegistryLoader();
    const bundledGithubOverrides = loader.getOverridesForProvider('github');

    expect(bundledGithubOverrides.length).toBeGreaterThan(0);

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

    expect(loader.getOverridesForProvider('github')).toEqual(bundledGithubOverrides);
    expect(loader.findOverride('github', 'remote-only-mobile-extension')).toBeNull();
    expect(loader.findOverride('openrouter', 'remote-model')).toMatchObject({
      apiModelId: 'remote-model',
      providerId: 'openrouter',
    });
    expect(loader.getProviderModelsVersion()).toBe('remote-provider-models');
  });
});
