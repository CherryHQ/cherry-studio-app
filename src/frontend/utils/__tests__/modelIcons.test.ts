import { resolveModelAssetIcon } from '@cherrystudio/ui/icons/models';
import { resolveProviderAssetIcon } from '@cherrystudio/ui/icons/providers';

import { resolveModelIconSources } from '../modelIcons';

describe('model icon identity', () => {
  test.each([
    ['deepseek-chat', 'deepseek'],
    ['deepseek-reasoner', 'deepseek'],
    ['gemini-router/DeepSeek-V4-Flash:free', 'deepseek'],
    ['gpt-gateway/deepseek-ai/DeepSeek-V4-Pro:cloud', 'deepseek'],
    ['deepseek-proxy/kimi-k2', 'kimi'],
    ['bytedance-seed/hy-2.0', 'hunyuan'],
    ['accounts/fireworks/models/gpt-5p4-mini', 'gpt-5-4-mini'],
    ['vendor/sora:cloud', 'sora'],
    ['doubao-seed-2.0-pro', 'doubao'],
  ])('uses the model brand for %s', (modelId, iconKey) => {
    const expected = resolveModelAssetIcon(iconKey);
    const { iconSource, modelIconSource } = resolveModelIconSources(modelId, 'openrouter');

    expect(expected).toBeDefined();
    expect(iconSource).toBe(expected);
    expect(modelIconSource).toBe(expected);
  });

  test('infers the provider from the base model before falling back to its host', () => {
    const inferred = resolveModelIconSources('deepseek-proxy/o3-mini', 'openrouter');
    const fallback = resolveModelIconSources('deepseek-proxy/custom-model', 'azure-openai');

    expect(inferred.iconSource).toBe(resolveProviderAssetIcon('openai'));
    expect(inferred.modelIconSource).toBeUndefined();
    expect(fallback.iconSource).toBe(resolveProviderAssetIcon('azureai'));
    expect(fallback.modelIconSource).toBeUndefined();
  });

  test('keeps unknown models without a provider on the initial fallback', () => {
    expect(resolveModelIconSources('deepseek-proxy/custom-model')).toEqual({
      iconSource: undefined,
      modelIconSource: undefined,
    });
  });
});
