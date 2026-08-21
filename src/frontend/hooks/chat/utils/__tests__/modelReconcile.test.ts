import { MODEL_CAPABILITY, REASONING_EFFORT } from '@cherrystudio/provider-registry';

import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

import { reconcileReasoningEffortForModel, reconcileWebSearchForModel } from '../modelReconcile';

function createModel(patch: Partial<Model> = {}): Model {
  return {
    capabilities: [],
    id: 'provider::model' as UniqueModelId,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: 'model',
    name: 'Model',
    providerId: 'provider',
    supportsStreaming: true,
    ...patch,
  };
}

describe('reconcileReasoningEffortForModel', () => {
  test('keeps the current effort when the next model supports it', () => {
    const model = createModel({
      reasoning: {
        selectableEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
      },
    });

    expect(reconcileReasoningEffortForModel(model, REASONING_EFFORT.HIGH)).toBeNull();
  });

  test('falls back to a supported effort when the current effort is unavailable', () => {
    const model = createModel({
      reasoning: {
        selectableEfforts: [REASONING_EFFORT.NONE, REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
      },
    });

    expect(reconcileReasoningEffortForModel(model, REASONING_EFFORT.MEDIUM)).toEqual({
      reasoning_effort: REASONING_EFFORT.HIGH,
    });
  });

  test('clears reasoning effort when the next model has no configurable reasoning', () => {
    const model = createModel();

    expect(reconcileReasoningEffortForModel(model, REASONING_EFFORT.HIGH)).toEqual({
      reasoning_effort: undefined,
    });
  });
});

describe('reconcileWebSearchForModel', () => {
  test('disables web search when the next model lacks web-search capability', () => {
    expect(
      reconcileWebSearchForModel(createModel(), {
        ...DEFAULT_ASSISTANT_SETTINGS,
        enableWebSearch: true,
      }),
    ).toEqual({ enableWebSearch: false });
  });

  test('keeps web search when the next model supports it', () => {
    expect(
      reconcileWebSearchForModel(createModel({ capabilities: [MODEL_CAPABILITY.WEB_SEARCH] }), {
        ...DEFAULT_ASSISTANT_SETTINGS,
        enableWebSearch: true,
      }),
    ).toBeNull();
  });

  test('keeps web search for a function-calling model', () => {
    expect(
      reconcileWebSearchForModel(createModel({ capabilities: [MODEL_CAPABILITY.FUNCTION_CALL] }), {
        enableWebSearch: true,
      }),
    ).toBeNull();
  });

  test('keeps web search for OpenRouter built-in search models', () => {
    expect(
      reconcileWebSearchForModel(
        createModel({
          id: 'openrouter::openai/gpt-4o-search-preview' as UniqueModelId,
          modelId: 'openai/gpt-4o-search-preview',
          providerId: 'openrouter',
        }),
        { enableWebSearch: true },
      ),
    ).toBeNull();
  });
});
