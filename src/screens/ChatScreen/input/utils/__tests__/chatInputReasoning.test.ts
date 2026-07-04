import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  chatInputReasoningEffortOptions,
  getChatInputReasoningEffortBarCount,
  getChatInputReasoningEffortOption,
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

  test('maps reasoning effort to active meter bars', () => {
    expect(getChatInputReasoningEffortBarCount(CHAT_INPUT_DEFAULT_REASONING_EFFORT)).toBe(0);
    expect(getChatInputReasoningEffortBarCount('none')).toBe(0);
    expect(getChatInputReasoningEffortBarCount('minimal')).toBe(1);
    expect(getChatInputReasoningEffortBarCount('low')).toBe(2);
    expect(getChatInputReasoningEffortBarCount('medium')).toBe(3);
    expect(getChatInputReasoningEffortBarCount('high')).toBe(4);
    expect(getChatInputReasoningEffortBarCount('max')).toBe(5);
    expect(getChatInputReasoningEffortBarCount('auto')).toBe(5);
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
