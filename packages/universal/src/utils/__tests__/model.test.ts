import { MODEL_CAPABILITY, REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@shared/data/types/model';

import {
  deriveModelGroupName,
  getModelSupportedReasoningEffortOptions,
  isDeepSeekModel,
  isOpenRouterBuiltInWebSearchModel,
} from '../model';

describe('deriveModelGroupName', () => {
  test.each([
    ['openai/gpt-4o', 'openai'],
    ['deepseek-v4-pro', 'deepseek'],
    ['gpt-5.6-sol', 'gpt'],
    ['codex-auto-review', 'codex'],
    ['hy3', undefined],
    ['  ', undefined],
  ])('derives %s as %s', (modelId, expected) => {
    expect(deriveModelGroupName(modelId)).toBe(expected);
  });
});

describe('DeepSeek model detection', () => {
  test('recognizes model ids, providers, and display names', () => {
    expect(isDeepSeekModel(createModel('deepseek-v3'))).toBe(true);
    expect(isDeepSeekModel(createModel('custom-v3', { providerId: 'deepseek' }))).toBe(true);
    expect(isDeepSeekModel(createModel('custom-v3', { name: 'DeepSeek V3' }))).toBe(true);
  });

  test('rejects missing and unrelated models', () => {
    expect(isDeepSeekModel(undefined)).toBe(false);
    expect(isDeepSeekModel(createModel('gpt-4o'))).toBe(false);
  });
});

describe('model reasoning support', () => {
  test('returns undefined for missing or non-reasoning models', () => {
    expect(getModelSupportedReasoningEffortOptions(undefined)).toBeUndefined();
    expect(getModelSupportedReasoningEffortOptions(createModel('gpt-4o'))).toBeUndefined();
  });

  test('uses registry-supported efforts when present', () => {
    const model = createModel('gpt-5', {
      capabilities: [MODEL_CAPABILITY.REASONING],
      reasoning: {
        selectableEfforts: [REASONING_EFFORT.MINIMAL, REASONING_EFFORT.LOW],
      },
    });

    expect(getModelSupportedReasoningEffortOptions(model)).toEqual([
      REASONING_EFFORT.MINIMAL,
      REASONING_EFFORT.LOW,
    ]);
  });

  test("returns Grok's registry vocabulary without model-id inference", () => {
    const model = createModel('grok-4-fast-reasoning', {
      capabilities: [MODEL_CAPABILITY.REASONING],
      providerId: 'openrouter',
      reasoning: {
        selectableEfforts: [REASONING_EFFORT.NONE, REASONING_EFFORT.AUTO],
      },
    });

    expect(getModelSupportedReasoningEffortOptions(model)).toEqual([
      REASONING_EFFORT.NONE,
      REASONING_EFFORT.AUTO,
    ]);
  });
});

describe('OpenRouter built-in web search', () => {
  test('recognizes search-preview and Sonar model ids', () => {
    expect(
      isOpenRouterBuiltInWebSearchModel(
        createModel('openai/gpt-4o-search-preview', { providerId: 'openrouter' }),
      ),
    ).toBe(true);
    expect(
      isOpenRouterBuiltInWebSearchModel(
        createModel('perplexity/sonar-pro', { providerId: 'openrouter' }),
      ),
    ).toBe(true);
  });

  test('does not infer support from a generic web-search capability', () => {
    expect(
      isOpenRouterBuiltInWebSearchModel(
        createModel('openai/gpt-5', {
          capabilities: [MODEL_CAPABILITY.WEB_SEARCH],
          providerId: 'openrouter',
        }),
      ),
    ).toBe(false);
  });

  test('does not classify Sonar outside OpenRouter', () => {
    expect(
      isOpenRouterBuiltInWebSearchModel(
        createModel('perplexity/sonar-pro', { providerId: 'perplexity' }),
      ),
    ).toBe(false);
  });
});

function createModel(modelId: string, patch: Partial<Model> = {}): Model {
  const providerId = patch.providerId ?? 'provider';

  return {
    capabilities: [],
    id: createUniqueModelId(providerId, modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
    ...patch,
  };
}
