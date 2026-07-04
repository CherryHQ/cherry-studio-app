import { MODEL_CAPABILITY, REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@/data/types/model';
import { getModelSupportedReasoningEffortOptions } from '../model';

describe('model reasoning support', () => {
  test('returns undefined for missing or non-reasoning models', () => {
    expect(getModelSupportedReasoningEffortOptions(undefined)).toBeUndefined();
    expect(getModelSupportedReasoningEffortOptions(createModel('gpt-4o'))).toBeUndefined();
  });

  test('uses registry-supported efforts when present', () => {
    const model = createModel('gpt-5', {
      capabilities: [MODEL_CAPABILITY.REASONING],
      reasoning: {
        supportedEfforts: [REASONING_EFFORT.MINIMAL, REASONING_EFFORT.LOW],
        type: 'openai-chat',
      },
    });

    expect(getModelSupportedReasoningEffortOptions(model)).toEqual([
      'default',
      REASONING_EFFORT.MINIMAL,
      REASONING_EFFORT.LOW,
    ]);
  });

  test('uses model-id fallback for grok fast reasoning models with empty efforts', () => {
    const model = createModel('grok-4-fast-reasoning', {
      capabilities: [MODEL_CAPABILITY.REASONING],
      providerId: 'openrouter',
      reasoning: {
        supportedEfforts: [],
        type: 'openrouter',
      },
    });

    expect(getModelSupportedReasoningEffortOptions(model)).toEqual([
      'default',
      REASONING_EFFORT.NONE,
      REASONING_EFFORT.AUTO,
    ]);
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
