import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import type { Model, UniqueModelId } from '@/data/types/model';
import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  chatInputReasoningEffortOptions,
  getChatInputReasoningEffortBarCount,
  getChatInputReasoningEffortMeterBarCount,
  getChatInputReasoningEffortOption,
  getChatInputReasoningEffortsForModel,
  getNextChatInputReasoningEffort,
  isChatInputReasoningEffortActive,
  isChatInputReasoningEffortOff,
  shouldShowChatInputReasoningEffortTag,
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

  test('cycles reasoning effort through quick-toggle order', () => {
    expect(getNextChatInputReasoningEffort(CHAT_INPUT_DEFAULT_REASONING_EFFORT)).toBe('minimal');
    expect(getNextChatInputReasoningEffort('low')).toBe('medium');
    expect(getNextChatInputReasoningEffort('auto')).toBe('none');
    expect(getNextChatInputReasoningEffort('none')).toBe(CHAT_INPUT_DEFAULT_REASONING_EFFORT);
  });

  test('cycles reasoning effort through model-supported order', () => {
    const supportedEfforts = [CHAT_INPUT_DEFAULT_REASONING_EFFORT, REASONING_EFFORT.HIGH] as const;

    expect(
      getNextChatInputReasoningEffort(CHAT_INPUT_DEFAULT_REASONING_EFFORT, supportedEfforts),
    ).toBe(REASONING_EFFORT.HIGH);
    expect(getNextChatInputReasoningEffort(REASONING_EFFORT.HIGH, supportedEfforts)).toBe(
      CHAT_INPUT_DEFAULT_REASONING_EFFORT,
    );
    expect(getNextChatInputReasoningEffort(REASONING_EFFORT.LOW, supportedEfforts)).toBe(
      CHAT_INPUT_DEFAULT_REASONING_EFFORT,
    );
  });

  test('orders off before default for model-supported reasoning effort cycling', () => {
    const supportedEfforts = [
      CHAT_INPUT_DEFAULT_REASONING_EFFORT,
      REASONING_EFFORT.NONE,
      REASONING_EFFORT.LOW,
      REASONING_EFFORT.MEDIUM,
      REASONING_EFFORT.HIGH,
    ] as const;

    expect(getNextChatInputReasoningEffort(REASONING_EFFORT.NONE, supportedEfforts)).toBe(
      CHAT_INPUT_DEFAULT_REASONING_EFFORT,
    );
    expect(
      getNextChatInputReasoningEffort(CHAT_INPUT_DEFAULT_REASONING_EFFORT, supportedEfforts),
    ).toBe(REASONING_EFFORT.LOW);
    expect(getNextChatInputReasoningEffort(REASONING_EFFORT.LOW, supportedEfforts)).toBe(
      REASONING_EFFORT.MEDIUM,
    );
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

  test('maps reasoning effort to active meter bars', () => {
    expect(getChatInputReasoningEffortBarCount(CHAT_INPUT_DEFAULT_REASONING_EFFORT)).toBe(3);
    expect(getChatInputReasoningEffortBarCount('none')).toBe(0);
    expect(getChatInputReasoningEffortBarCount('minimal')).toBe(1);
    expect(getChatInputReasoningEffortBarCount('low')).toBe(1);
    expect(getChatInputReasoningEffortBarCount('medium')).toBe(2);
    expect(getChatInputReasoningEffortBarCount('high')).toBe(3);
    expect(getChatInputReasoningEffortBarCount('max')).toBe(4);
    expect(getChatInputReasoningEffortBarCount('auto')).toBe(5);
  });

  test('sizes the reasoning meter to the highest supported effort', () => {
    expect(
      getChatInputReasoningEffortMeterBarCount([
        CHAT_INPUT_DEFAULT_REASONING_EFFORT,
        REASONING_EFFORT.LOW,
        REASONING_EFFORT.MEDIUM,
        REASONING_EFFORT.HIGH,
      ]),
    ).toBe(3);
    expect(
      getChatInputReasoningEffortMeterBarCount([
        CHAT_INPUT_DEFAULT_REASONING_EFFORT,
        REASONING_EFFORT.LOW,
        REASONING_EFFORT.MEDIUM,
        REASONING_EFFORT.HIGH,
        REASONING_EFFORT.MAX,
      ]),
    ).toBe(4);
  });

  test('only treats concrete enabled reasoning efforts as active', () => {
    expect(isChatInputReasoningEffortActive(CHAT_INPUT_DEFAULT_REASONING_EFFORT)).toBe(false);
    expect(isChatInputReasoningEffortActive('none')).toBe(false);
    expect(isChatInputReasoningEffortActive('high')).toBe(true);
  });

  test('detects the off reasoning effort', () => {
    expect(isChatInputReasoningEffortOff('none')).toBe(true);
    expect(isChatInputReasoningEffortOff(CHAT_INPUT_DEFAULT_REASONING_EFFORT)).toBe(false);
    expect(isChatInputReasoningEffortOff('low')).toBe(false);
  });

  test('shows the reasoning tag for selected default or enabled efforts only', () => {
    expect(shouldShowChatInputReasoningEffortTag(false, CHAT_INPUT_DEFAULT_REASONING_EFFORT)).toBe(
      false,
    );
    expect(shouldShowChatInputReasoningEffortTag(true, CHAT_INPUT_DEFAULT_REASONING_EFFORT)).toBe(
      true,
    );
    expect(shouldShowChatInputReasoningEffortTag(true, 'none')).toBe(false);
    expect(shouldShowChatInputReasoningEffortTag(true, 'high')).toBe(true);
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
