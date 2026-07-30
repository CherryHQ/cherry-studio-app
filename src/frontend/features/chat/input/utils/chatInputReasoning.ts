import {
  objectValues,
  REASONING_EFFORT,
  type ReasoningEffort,
} from '@cherrystudio/provider-registry';
import { getModelSupportedReasoningEffortOptions } from '@/ai/utils/model';
import type { Model } from '@/shared/domain/model';

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
  REASONING_EFFORT.NONE,
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  REASONING_EFFORT.MINIMAL,
  REASONING_EFFORT.LOW,
  REASONING_EFFORT.MEDIUM,
  REASONING_EFFORT.HIGH,
  REASONING_EFFORT.MAX,
  REASONING_EFFORT.AUTO,
] as const satisfies readonly ChatInputReasoningEffort[];

const reasoningEffortValueSet = new Set<string>(objectValues(REASONING_EFFORT));
const reasoningEffortCycleOrderIndex = new Map<ChatInputReasoningEffort, number>(
  chatInputReasoningEffortCycleOrder.map((value, index) => [value, index]),
);

export function getChatInputReasoningEffortOption(value: string | null | undefined) {
  return chatInputReasoningEffortOptions.find((option) => option.value === value);
}

export function getChatInputReasoningEffortsForModel(
  model: Model | null | undefined,
): ChatInputReasoningEffort[] {
  const supportedOptions = getModelSupportedReasoningEffortOptions(model);
  if (!supportedOptions?.length) {
    return [];
  }

  return normalizeChatInputReasoningEfforts(supportedOptions);
}

export function getFallbackChatInputReasoningEffort(
  availableEfforts: readonly ChatInputReasoningEffort[],
) {
  const normalizedEfforts = normalizeChatInputReasoningEfforts(availableEfforts);

  return normalizedEfforts.includes(CHAT_INPUT_DEFAULT_REASONING_EFFORT)
    ? CHAT_INPUT_DEFAULT_REASONING_EFFORT
    : (normalizedEfforts[0] ?? CHAT_INPUT_DEFAULT_REASONING_EFFORT);
}

export function isChatInputReasoningEffortAvailable(
  reasoningEffort: ChatInputReasoningEffort,
  availableEfforts: readonly ChatInputReasoningEffort[],
) {
  return normalizeChatInputReasoningEfforts(availableEfforts).includes(reasoningEffort);
}

function normalizeChatInputReasoningEfforts(values: readonly string[]): ChatInputReasoningEffort[] {
  const result = new Set<ChatInputReasoningEffort>();

  for (const value of values) {
    const normalized = normalizeChatInputReasoningEffort(value);
    if (normalized) {
      result.add(normalized);
    }
  }

  return Array.from(result).sort(
    (a, b) =>
      (reasoningEffortCycleOrderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (reasoningEffortCycleOrderIndex.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

function normalizeChatInputReasoningEffort(value: string): ChatInputReasoningEffort | undefined {
  if (value === CHAT_INPUT_DEFAULT_REASONING_EFFORT) {
    return CHAT_INPUT_DEFAULT_REASONING_EFFORT;
  }

  if (value === 'xhigh') {
    return REASONING_EFFORT.MAX;
  }

  return reasoningEffortValueSet.has(value) ? (value as ReasoningEffort) : undefined;
}
