import type { ReasoningWireProfile } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';

import { encodeReasoningInvocation, resolveReasoningInvocation } from '../reasoningSerializers';

const budgetProfile: ReasoningWireProfile = {
  effort: {
    operations: [{ target: 'thinking.budgetTokens', value: { source: 'budget' } }],
    budget: { min: 1024, missing: { type: 'fallback', value: 13_312 }, clampToMaxTokens: true },
  },
};

function createModel(reasoning: NonNullable<Model['reasoning']>): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('anthropic', 'claude-test'),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: 'claude-test',
    name: 'Claude Test',
    providerId: 'anthropic',
    reasoning,
    supportsStreaming: true,
  };
}

const budgetModel = createModel({
  controls: [{ kind: 'budget', min: 1024, max: 64_000 }],
  selectableEfforts: ['high'],
  thinkingTokenLimits: { min: 1024, max: 64_000 },
});

describe('resolveReasoningInvocation', () => {
  it.each([256, 1024])(
    'omits a budget mode when maxTokens=%i cannot satisfy its minimum',
    (maxTokens) => {
      expect(
        resolveReasoningInvocation({
          selection: 'high',
          model: budgetModel,
          profile: budgetProfile,
          maxTokens,
        }),
      ).toEqual({ kind: 'omit', selection: 'high', emissions: [] });
    },
  );

  it('clamps a budget below maxTokens while preserving the declared minimum', () => {
    const result = resolveReasoningInvocation({
      selection: 'high',
      model: budgetModel,
      profile: budgetProfile,
      maxTokens: 8192,
    });

    expect(result.kind).toBe('budget');
    expect(result.budgetTokens).toBe(8191);
  });

  it('uses the 8192 default output limit when no maxTokens value is available', () => {
    const result = resolveReasoningInvocation({
      selection: 'high',
      model: budgetModel,
      profile: budgetProfile,
    });

    expect(result.budgetTokens).toBe(8191);
  });

  it('uses the declared budget floor and ceiling for the canonical extremes', () => {
    const model = createModel({
      controls: [{ kind: 'budget', min: 0, max: 10_000 }],
      selectableEfforts: ['minimal', 'max'],
      thinkingTokenLimits: { min: 0, max: 10_000 },
    });
    const profile: ReasoningWireProfile = {
      effort: {
        operations: [{ target: 'reasoning_budget', value: { source: 'budget' } }],
        budget: { missing: { type: 'omit-mode' } },
      },
    };

    expect(resolveReasoningInvocation({ selection: 'minimal', model, profile }).budgetTokens).toBe(
      1024,
    );
    expect(resolveReasoningInvocation({ selection: 'max', model, profile }).budgetTokens).toBe(
      10_000,
    );
  });

  it('applies fallback, omit-mode, and omit-value missing-budget policies', () => {
    const model = createModel({
      controls: [{ kind: 'effort', values: ['high'] }],
      selectableEfforts: ['high'],
    });
    const mode = {
      operations: [
        { target: 'enable_thinking' as const, value: { source: 'literal' as const, value: true } },
        { target: 'thinking_budget' as const, value: { source: 'budget' as const } },
      ],
    };

    const fallback = resolveReasoningInvocation({
      selection: 'high',
      model,
      profile: {
        effort: { ...mode, budget: { missing: { type: 'fallback', value: 13_312 } } },
      },
    });
    expect(encodeReasoningInvocation(fallback)).toEqual({
      enable_thinking: true,
      thinking_budget: 13_312,
    });

    const omittedMode = resolveReasoningInvocation({
      selection: 'high',
      model,
      profile: { effort: { ...mode, budget: { missing: { type: 'omit-mode' } } } },
    });
    expect(omittedMode).toEqual({ kind: 'omit', selection: 'high', emissions: [] });

    const omittedValue = resolveReasoningInvocation({
      selection: 'high',
      model,
      profile: { effort: { ...mode, budget: { missing: { type: 'omit-value' } } } },
    });
    expect(encodeReasoningInvocation(omittedValue)).toEqual({ enable_thinking: true });
  });

  it('encodes nested and flat reviewed targets without provider or model branches', () => {
    const profile: ReasoningWireProfile = {
      effort: {
        operations: [
          { target: 'reasoning_budget', value: { source: 'budget' } },
          {
            target: 'chat_template_kwargs.thinking_mode',
            value: { source: 'literal', value: 'adaptive' },
          },
        ],
        budget: { min: 1, missing: { type: 'omit-mode' } },
      },
    };

    const invocation = resolveReasoningInvocation({
      selection: 'high',
      model: budgetModel,
      profile,
      maxTokens: 64_000,
    });

    expect(encodeReasoningInvocation(invocation)).toEqual({
      reasoning_budget: 51_404,
      chat_template_kwargs: { thinking_mode: 'adaptive' },
    });
  });

  it('maps unsupported canonical effort to the nearest selectable tier', () => {
    const model = createModel({
      controls: [{ kind: 'effort', values: ['none', 'high', 'max'] }],
      selectableEfforts: ['none', 'high', 'max'],
    });
    const profile: ReasoningWireProfile = {
      effort: { operations: [{ target: 'reasoningEffort', value: { source: 'effort' } }] },
    };

    expect(resolveReasoningInvocation({ selection: 'xhigh', model, profile })).toMatchObject({
      kind: 'effort',
      effort: 'max',
      selection: 'max',
    });
  });

  it('emits assistant summary only when the active profile requests it', () => {
    const model = createModel({
      controls: [{ kind: 'effort', values: ['low'] }],
      selectableEfforts: ['low'],
    });
    const profile: ReasoningWireProfile = {
      effort: {
        operations: [
          { target: 'reasoningEffort', value: { source: 'effort' } },
          { target: 'reasoningSummary', value: { source: 'assistant-summary' } },
        ],
      },
    };

    const invocation = resolveReasoningInvocation({
      selection: 'low',
      model,
      profile,
      assistantSummary: 'detailed',
    });

    expect(encodeReasoningInvocation(invocation)).toEqual({
      reasoningEffort: 'low',
      reasoningSummary: 'detailed',
    });
  });

  it('leaves default omitted when the profile declares no default mode', () => {
    const result = resolveReasoningInvocation({
      selection: 'default',
      model: budgetModel,
      profile: budgetProfile,
    });

    expect(result).toEqual({ kind: 'omit', selection: 'default', emissions: [] });
  });
});
