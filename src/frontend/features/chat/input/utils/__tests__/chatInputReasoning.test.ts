import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import type { Model, UniqueModelId } from '@/shared/domain/model';
import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  chatInputReasoningEffortOptions,
  getChatInputReasoningEffortOption,
  getChatInputReasoningEffortsForModel,
} from '../chatInputReasoning';

describe('chat input reasoning', () => {
  test('includes the supported local reasoning options in display order', () => {
    expect(chatInputReasoningEffortOptions.map((option) => option.value)).toEqual([
      'default',
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'max',
      'auto',
    ]);
  });

  test('finds reasoning effort options by value', () => {
    expect(getChatInputReasoningEffortOption('high')?.labelKey).toBe('chat.reasoning.high');
    expect(getChatInputReasoningEffortOption('unknown')).toBeUndefined();
  });

  test('returns no reasoning efforts without a selected reasoning model', () => {
    expect(getChatInputReasoningEffortsForModel(null)).toEqual([]);
    expect(getChatInputReasoningEffortsForModel(createModel())).toEqual([]);
  });

  test('maps model-supported reasoning efforts into input options', () => {
    const model = createModel({
      reasoning: {
        supportedEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
        type: 'openai-chat',
      },
    });

    expect(getChatInputReasoningEffortsForModel(model)).toEqual([
      CHAT_INPUT_DEFAULT_REASONING_EFFORT,
      REASONING_EFFORT.LOW,
      REASONING_EFFORT.HIGH,
    ]);
  });

  test('normalizes xhigh model options to the mobile max effort', () => {
    const model = createModel({
      reasoning: {
        supportedEfforts: ['xhigh' as typeof REASONING_EFFORT.MAX],
        type: 'openai-chat',
      },
    });

    expect(getChatInputReasoningEffortsForModel(model)).toEqual([
      CHAT_INPUT_DEFAULT_REASONING_EFFORT,
      REASONING_EFFORT.MAX,
    ]);
  });
});

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
