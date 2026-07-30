import { MODEL_CAPABILITY, REASONING_EFFORT } from '@cherrystudio/provider-registry';

import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/domain/assistant';
import type { Model, UniqueModelId } from '@/shared/domain/model';
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
        supportedEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
        type: 'openai-chat',
      },
    });

    expect(
      reconcileReasoningEffortForModel(model, REASONING_EFFORT.HIGH, 'assistant-1'),
    ).toBeNull();
  });

  test('falls back to a supported effort when the current effort is unavailable', () => {
    const model = createModel({
      reasoning: {
        supportedEfforts: [REASONING_EFFORT.NONE, REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
        type: 'openai-chat',
      },
    });

    expect(reconcileReasoningEffortForModel(model, REASONING_EFFORT.MEDIUM, 'assistant-1')).toEqual(
      {
        reasoning_effort: REASONING_EFFORT.LOW,
      },
    );
  });

  test('clears reasoning effort when the next model has no configurable reasoning', () => {
    const model = createModel();

    expect(reconcileReasoningEffortForModel(model, REASONING_EFFORT.HIGH, 'assistant-1')).toEqual({
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
});
