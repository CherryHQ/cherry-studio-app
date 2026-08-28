import { describe, expect, it } from 'vitest';

import { MobileRegistryLoader } from '../mobile-loader';

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
});
