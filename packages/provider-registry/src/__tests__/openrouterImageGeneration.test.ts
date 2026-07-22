import { describe, expect, it } from 'vitest';

import modelsRegistry from '../../data/models.json';
import providerModelsRegistry from '../../data/provider-models.json';
import openrouter from '../providers/openrouter';

const models = modelsRegistry.models as Array<{
  id: string;
}>;
const overrides = providerModelsRegistry.overrides as Array<{
  imageGeneration?: unknown;
  modelId: string;
  providerId: string;
}>;

describe('OpenRouter image generation registry', () => {
  it('declares image model discovery and generation endpoints', () => {
    expect(openrouter.endpointConfigs?.['openai-chat-completions']?.modelsApiUrls?.image).toBe(
      'https://openrouter.ai/api/v1/images/models',
    );
    expect(openrouter.endpointConfigs?.['openai-image-generation']).toMatchObject({
      adapterFamily: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1/',
    });
  });

  it('keeps image-capable OpenRouter overrides linked to generated model data', () => {
    const imageOverrides = overrides.filter(
      (override) => override.providerId === 'openrouter' && override.imageGeneration,
    );
    const modelIds = new Set(models.map((model) => model.id));

    expect(imageOverrides.length).toBeGreaterThan(0);
    expect(imageOverrides.map((override) => override.modelId)).toEqual(
      expect.arrayContaining(['gpt-image-2', 'flux-2-pro', 'seedream-4-5']),
    );
    expect(
      imageOverrides.filter(
        (override) => override.modelId !== 'auto' && !modelIds.has(override.modelId),
      ),
    ).toEqual([]);
    expect(imageOverrides.find((override) => override.modelId === 'auto')).toMatchObject({
      providerId: 'openrouter',
    });
  });
});
