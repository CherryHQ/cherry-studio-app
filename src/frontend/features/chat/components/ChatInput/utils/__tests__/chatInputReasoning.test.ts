import { REASONING_EFFORT } from '@cherrystudio/provider-registry';

import type { Model, UniqueModelId } from '@/shared/data/types/model';

import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  chatInputReasoningEffortOptions,
  getChatInputReasoningEffortOption,
  getChatInputReasoningEffortSnapshot,
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
        selectableEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
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
        selectableEfforts: [REASONING_EFFORT.XHIGH],
      },
    });

    expect(getChatInputReasoningEffortsForModel(model)).toEqual([
      CHAT_INPUT_DEFAULT_REASONING_EFFORT,
      REASONING_EFFORT.MAX,
    ]);
  });

  test('snapshots the model default until the user selects a request override', () => {
    expect(getChatInputReasoningEffortSnapshot('high', false)).toBe('default');
    expect(getChatInputReasoningEffortSnapshot('high', false, ['default', 'low', 'high'])).toBe(
      'default',
    );
    expect(getChatInputReasoningEffortSnapshot('high', true)).toBe('high');
    expect(getChatInputReasoningEffortSnapshot('low', true, ['default', 'low', 'high'])).toBe(
      'low',
    );
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
