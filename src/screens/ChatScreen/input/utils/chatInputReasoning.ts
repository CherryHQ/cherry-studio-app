import { REASONING_EFFORT, type ReasoningEffort } from '@cherrystudio/provider-registry';

export const CHAT_INPUT_DEFAULT_REASONING_EFFORT = 'default';

export type ChatInputReasoningEffort = typeof CHAT_INPUT_DEFAULT_REASONING_EFFORT | ReasoningEffort;

type ChatInputReasoningEffortOption = {
  labelKey: string;
  value: ChatInputReasoningEffort;
};

export const chatInputReasoningEffortOptions = [
  {
    labelKey: 'chat.reasoning.default',
    value: CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  },
  {
    labelKey: 'chat.reasoning.off',
    value: REASONING_EFFORT.NONE,
  },
  {
    labelKey: 'chat.reasoning.minimal',
    value: REASONING_EFFORT.MINIMAL,
  },
  {
    labelKey: 'chat.reasoning.low',
    value: REASONING_EFFORT.LOW,
  },
  {
    labelKey: 'chat.reasoning.medium',
    value: REASONING_EFFORT.MEDIUM,
  },
  {
    labelKey: 'chat.reasoning.high',
    value: REASONING_EFFORT.HIGH,
  },
  {
    labelKey: 'chat.reasoning.max',
    value: REASONING_EFFORT.MAX,
  },
  {
    labelKey: 'chat.reasoning.auto',
    value: REASONING_EFFORT.AUTO,
  },
] as const satisfies readonly ChatInputReasoningEffortOption[];

const chatInputReasoningEffortCycleOrder = [
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  REASONING_EFFORT.MINIMAL,
  REASONING_EFFORT.LOW,
  REASONING_EFFORT.MEDIUM,
  REASONING_EFFORT.HIGH,
  REASONING_EFFORT.MAX,
  REASONING_EFFORT.AUTO,
  REASONING_EFFORT.NONE,
] as const satisfies readonly ChatInputReasoningEffort[];

export function getChatInputReasoningEffortOption(value: string | null | undefined) {
  return chatInputReasoningEffortOptions.find((option) => option.value === value);
}

export function getNextChatInputReasoningEffort(value: ChatInputReasoningEffort) {
  const currentIndex = chatInputReasoningEffortCycleOrder.indexOf(value);
  const nextIndex =
    currentIndex === -1 ? 0 : (currentIndex + 1) % chatInputReasoningEffortCycleOrder.length;

  return chatInputReasoningEffortCycleOrder[nextIndex];
}

export function getChatInputReasoningEffortBarCount(value: ChatInputReasoningEffort) {
  switch (value) {
    case REASONING_EFFORT.MINIMAL:
      return 1;
    case REASONING_EFFORT.LOW:
      return 2;
    case REASONING_EFFORT.MEDIUM:
      return 3;
    case REASONING_EFFORT.HIGH:
      return 4;
    case REASONING_EFFORT.AUTO:
    case REASONING_EFFORT.MAX:
      return 5;
    case CHAT_INPUT_DEFAULT_REASONING_EFFORT:
    case REASONING_EFFORT.NONE:
      return 0;
  }

  return 0;
}

export function isChatInputReasoningEffortOff(reasoningEffort: ChatInputReasoningEffort) {
  return reasoningEffort === REASONING_EFFORT.NONE;
}

export function isChatInputReasoningEffortActive(reasoningEffort: ChatInputReasoningEffort) {
  return (
    reasoningEffort !== CHAT_INPUT_DEFAULT_REASONING_EFFORT &&
    reasoningEffort !== REASONING_EFFORT.NONE
  );
}

export function shouldShowChatInputReasoningEffortTag(
  isReasoningEffortSelected: boolean,
  reasoningEffort: ChatInputReasoningEffort,
) {
  return isReasoningEffortSelected && reasoningEffort !== REASONING_EFFORT.NONE;
}
