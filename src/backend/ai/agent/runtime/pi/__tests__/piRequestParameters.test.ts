import {
  REASONING_FORMAT_PROFILES,
  selectFormatWire,
  type ReasoningWireProfile,
} from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

import type { SupportedPiApi } from '../piApiAdapters';
import { applyPiRequestParameters, type PiRequestParameters } from '../piRequestParameters';

const model: Model = {
  id: 'provider::model',
  providerId: 'provider',
  modelId: 'model',
  name: 'Model',
  capabilities: [],
  isEnabled: true,
  isHidden: false,
  supportsStreaming: true,
  reasoning: {
    selectableEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto'],
    thinkingTokenLimits: { min: 1024, max: 8192 },
  },
};

function apply(
  api: SupportedPiApi,
  profile: ReasoningWireProfile,
  selection: PiRequestParameters['selection'],
  payload: Record<string, unknown> = {},
  overrides: Partial<PiRequestParameters> = {},
  maxTokens = 4096,
) {
  return applyPiRequestParameters(
    payload,
    api,
    { model, profile, selection, ...overrides },
    maxTokens,
    0.5,
  );
}

describe('Pi registry request parameters', () => {
  test.each(['default', undefined] as const)(
    'leaves provider reasoning defaults intact for %s',
    (selection) => {
      const payload = {
        model: 'model',
        reasoning_effort: 'medium',
        reasoning: { effort: 'medium', summary: 'auto' },
        thinking: { type: 'enabled', budget_tokens: 2048 },
        enable_thinking: true,
        chat_template_kwargs: { enable_thinking: true, custom: 'keep' },
        tool_choice: 'none',
      };
      expect(
        apply(
          'openai-completions',
          REASONING_FORMAT_PROFILES['openai-chat'].wire,
          selection,
          payload,
        ),
      ).toEqual({
        model: 'model',
        chat_template_kwargs: { custom: 'keep' },
        tool_choice: 'none',
        temperature: 0.5,
      });
      expect(payload.chat_template_kwargs.enable_thinking).toBe(true);
      expect(payload.reasoning.effort).toBe('medium');
    },
  );

  test.each(['xhigh', 'max'] as const)(
    'preserves the declared %s effort on OpenAI Responses',
    (selection) => {
      const result = apply(
        'openai-responses',
        REASONING_FORMAT_PROFILES['openai-responses'].wire,
        selection,
        {
          reasoning: { effort: 'medium', summary: 'auto' },
        },
      );
      expect(result.reasoning).toEqual({ effort: selection });
      expect(result).not.toHaveProperty('reasoningEffort');
      expect(result).not.toHaveProperty('reasoning_effort');
    },
  );

  test('remaps unsupported effort without forcing a fixed reasoning model off', () => {
    const fixedModel = { ...model, reasoning: { selectableEfforts: ['high' as const] } };
    const profile = REASONING_FORMAT_PROFILES['openai-chat'].wire;
    expect(
      apply('openai-completions', profile, 'max', {}, { model: fixedModel }).reasoning_effort,
    ).toBe('high');
    expect(
      apply(
        'openai-completions',
        profile,
        'off',
        { reasoning_effort: 'none' },
        { model: fixedModel },
      ),
    ).not.toHaveProperty('reasoning_effort');
  });

  test('uses a provider-declared switch instead of Pi URL heuristics', () => {
    const profile: ReasoningWireProfile = {
      off: {
        operations: [{ target: 'enable_thinking', value: { source: 'literal', value: false } }],
      },
      auto: {
        operations: [{ target: 'enable_thinking', value: { source: 'literal', value: true } }],
      },
    };
    expect(apply('openai-completions', profile, 'auto', { reasoning_effort: 'high' })).toEqual({
      enable_thinking: true,
      temperature: 0.5,
    });
    expect(apply('openai-completions', profile, 'off')).toEqual({
      enable_thinking: false,
      temperature: 0.5,
    });
    expect(apply('openai-completions', profile, 'default')).not.toHaveProperty('enable_thinking');
  });

  test('uses adaptive Claude effort without retaining a legacy budget or sampling parameter', () => {
    const result = apply('anthropic-messages', REASONING_FORMAT_PROFILES.anthropic.wire, 'xhigh', {
      thinking: { type: 'enabled', budget_tokens: 2048 },
      max_tokens: 8192,
      temperature: 0.5,
      output_config: { format: { type: 'json_schema' } },
    });
    expect(result).toEqual({
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'xhigh', format: { type: 'json_schema' } },
      max_tokens: 4096,
    });
    expect(
      apply('anthropic-messages', REASONING_FORMAT_PROFILES.anthropic.wire, 'auto').thinking,
    ).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  test('bounds Claude budget thinking by the total output limit and omits impossible budgets', () => {
    const profile = selectFormatWire(REASONING_FORMAT_PROFILES.anthropic, 'budget');
    expect(apply('anthropic-messages', profile, 'high', { max_tokens: 8192 })).toEqual({
      thinking: { type: 'enabled', budget_tokens: 4095 },
      max_tokens: 4096,
    });
    const tooSmall = apply('anthropic-messages', profile, 'high', { max_tokens: 8192 }, {}, 64);
    expect(tooSmall).not.toHaveProperty('thinking');
    expect(tooSmall.max_tokens).toBe(64);
  });

  test('keeps Gemini budget and level dialects separate, preserving native request controls', () => {
    const signal = new AbortController().signal;
    const payload = {
      config: {
        abortSignal: signal,
        thinkingConfig: { thinkingBudget: 1024 },
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
      },
    };
    const budget = apply(
      'google-generative-ai',
      selectFormatWire(REASONING_FORMAT_PROFILES.gemini, 'budget'),
      'auto',
      payload,
    );
    expect(budget.config).toEqual({
      abortSignal: signal,
      thinkingConfig: { includeThoughts: true, thinkingBudget: -1 },
      toolConfig: { functionCallingConfig: { mode: 'NONE' } },
      temperature: 0.5,
    });
    const level = apply(
      'google-generative-ai',
      REASONING_FORMAT_PROFILES.gemini.wire,
      'high',
      payload,
    );
    expect(level.config).toMatchObject({
      thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' },
    });
    expect(level).not.toHaveProperty('config.thinkingConfig.thinkingBudget');
    expect(
      apply('google-generative-ai', REASONING_FORMAT_PROFILES.gemini.wire, 'default', payload),
    ).not.toHaveProperty('config.thinkingConfig');
    expect(payload.config.thinkingConfig).toEqual({ thinkingBudget: 1024 });
  });

  test('honors unsupported reasoning and sampling metadata', () => {
    const result = apply(
      'openai-completions',
      { disabled: true },
      'high',
      { reasoning_effort: 'high', temperature: 0.5 },
      {
        model: { ...model, parameters: { temperature: { supported: false } } },
      },
    );
    expect(result).toEqual({});
    expect(
      apply(
        'openai-completions',
        { disabled: true },
        'default',
        {},
        {
          model: {
            ...model,
            parameters: { temperature: { supported: true, range: { min: 0, max: 0.3 } } },
          },
        },
      ).temperature,
    ).toBe(0.3);
  });
});
