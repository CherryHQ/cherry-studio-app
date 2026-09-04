import type { ReasoningEffort } from './schemas/enums';
import type { ReasoningWireDialect } from './schemas/model';
import type { ReasoningFormatType } from './schemas/provider';
import type {
  ReasoningFormatWireProfile,
  ReasoningWireMode,
  ReasoningWireOperation,
  ReasoningWireProfile,
  ReasoningWireTarget,
  ReasoningWireValue,
} from './schemas/reasoningWire';

type NonBudgetOperation = Omit<ReasoningWireOperation, 'value'> & {
  value: Exclude<ReasoningWireValue, { source: 'budget' }>;
};

type NonBudgetMode = {
  operations: NonBudgetOperation[];
  effortMap?: Partial<Record<ReasoningEffort, ReasoningEffort>>;
};

const literal = (
  target: ReasoningWireTarget,
  value: string | number | boolean,
): NonBudgetOperation => ({
  target,
  value: { source: 'literal', value },
});

const effort = (target: ReasoningWireTarget): NonBudgetOperation => ({
  target,
  value: { source: 'effort' },
});

const summary = (target: ReasoningWireTarget): NonBudgetOperation => ({
  target,
  value: { source: 'assistant-summary' },
});

const budgetTokens = (target: ReasoningWireTarget): ReasoningWireOperation => ({
  target,
  value: { source: 'budget' },
});

const mode = (
  operations: NonBudgetOperation[],
  rest: Omit<NonBudgetMode, 'operations'> = {},
): NonBudgetMode => ({
  operations,
  ...rest,
});

const genericEffort = (summaryTarget?: ReasoningWireTarget): ReasoningWireProfile => {
  const suffix = summaryTarget ? [summary(summaryTarget)] : [];
  return {
    off: mode([literal('reasoningEffort', 'none'), ...suffix]),
    auto: mode([effort('reasoningEffort'), ...suffix], { effortMap: { auto: 'medium' } }),
    effort: mode([effort('reasoningEffort'), ...suffix]),
  };
};

const REASONING_SUMMARY_OPERATION = summary('reasoningSummary') satisfies ReasoningWireOperation;

function stripReasoningSummary(mode: ReasoningWireMode | undefined): ReasoningWireMode | undefined {
  if (!mode) return undefined;
  const operations = mode.operations.filter((operation) => operation.target !== 'reasoningSummary');
  return operations.length > 0 ? ({ ...mode, operations } as ReasoningWireMode) : undefined;
}

/** Apply an explicit host compatibility choice to an OpenAI Responses wire. */
export function configureOpenAIResponsesSummary(
  profile: ReasoningWireProfile,
  enabled: boolean,
): ReasoningWireProfile {
  if (profile.disabled) return profile;

  const configured: ReasoningWireProfile = { ...profile };
  for (const key of ['default', 'off', 'auto', 'effort'] as const) {
    const strippedMode = stripReasoningSummary(configured[key]);
    if (enabled && key !== 'default' && strippedMode) {
      configured[key] = {
        ...strippedMode,
        operations: [...strippedMode.operations, REASONING_SUMMARY_OPERATION],
      } as ReasoningWireMode;
    } else if (strippedMode) {
      configured[key] = strippedMode;
    } else {
      delete configured[key];
    }
  }
  return configured;
}

/** Official OpenAI-compatible Responses wire with reasoning summaries enabled. */
export const openaiResponsesSummaryWire = configureOpenAIResponsesSummary(genericEffort(), true);

/** Gemini 2.x uses token budgets and rejects Gemini 3's thinking-level field. */
const geminiBudgetWire: ReasoningWireProfile = {
  off: mode([
    literal('thinkingConfig.includeThoughts', false),
    literal('thinkingConfig.thinkingBudget', 0),
  ]),
  auto: mode([
    literal('thinkingConfig.includeThoughts', true),
    literal('thinkingConfig.thinkingBudget', -1),
  ]),
  effort: {
    operations: [
      literal('thinkingConfig.includeThoughts', true),
      budgetTokens('thinkingConfig.thinkingBudget'),
    ],
    budget: { missing: { type: 'fallback', value: -1 } },
  },
};

/** Claude <=4.5 uses enabled + budget_tokens and rejects adaptive thinking. */
const anthropicEnabledBudget = {
  operations: [
    literal('thinking.type', 'enabled'),
    budgetTokens('thinking.budgetTokens'),
    literal('sendReasoning', true),
  ],
  budget: { missing: { type: 'fallback' as const, value: 13_312 }, clampToMaxTokens: true },
};

const anthropicBudgetWire: ReasoningWireProfile = {
  off: mode([literal('thinking.type', 'disabled')]),
  auto: anthropicEnabledBudget,
  effort: anthropicEnabledBudget,
};

const formatProfiles = {
  'openai-chat': {
    wire: genericEffort(),
  },
  'openai-responses': {
    wire: genericEffort(),
  },
  anthropic: {
    wire: {
      off: mode([literal('thinking.type', 'disabled')]),
      auto: mode([literal('thinking.type', 'adaptive'), literal('thinking.display', 'summarized')]),
      effort: mode(
        [
          literal('thinking.type', 'adaptive'),
          literal('thinking.display', 'summarized'),
          effort('effort'),
        ],
        { effortMap: { minimal: 'low' } },
      ),
    },
    budgetWire: anthropicBudgetWire,
  },
  gemini: {
    wire: {
      off: mode([
        literal('thinkingConfig.includeThoughts', false),
        literal('thinkingConfig.thinkingLevel', 'minimal'),
      ]),
      auto: mode([literal('thinkingConfig.includeThoughts', true)]),
      effort: mode([
        literal('thinkingConfig.includeThoughts', true),
        effort('thinkingConfig.thinkingLevel'),
      ]),
    },
    budgetWire: geminiBudgetWire,
  },
  ollama: {
    wire: {
      off: mode([literal('think', false)]),
      auto: mode([literal('think', true)]),
      effort: mode([effort('think')]),
    },
  },
  none: {
    wire: { disabled: true },
  },
} as const satisfies Record<ReasoningFormatType, ReasoningFormatWireProfile>;

export const REASONING_FORMAT_PROFILES: Record<ReasoningFormatType, ReasoningFormatWireProfile> =
  formatProfiles;

/** Select the generation-specific wire while preserving single-dialect formats. */
export function selectFormatWire(
  profile: ReasoningFormatWireProfile,
  dialect: ReasoningWireDialect | undefined,
): ReasoningWireProfile {
  return dialect === 'budget' && profile.budgetWire ? profile.budgetWire : profile.wire;
}
