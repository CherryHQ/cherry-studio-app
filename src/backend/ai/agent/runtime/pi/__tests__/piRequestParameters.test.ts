import {
  REASONING_FORMAT_PROFILES,
  selectFormatWire,
  type ReasoningWireProfile,
} from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

import type { SupportedPiApi } from '../piApiAdapters';
import {
  applyPiRequestCompatibility,
  applyPiRequestParameters,
  type PiRequestParameters,
} from '../piRequestParameters';

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

describe('Gemini compatible tool-call replay', () => {
  test.each(['gemini-3-pro', 'google/gemini-4-argon', 'gemini-flash-latest'])(
    'adds a missing signature for %s without overwriting signed calls or other metadata',
    (modelId) => {
      const calls = [
        {
          id: 'missing',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
          extra_content: { other: 'keep', google: { metadata: 'keep' } },
        },
        {
          id: 'signed',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
          extra_content: { google: { thought_signature: 'original-signature' } },
        },
        { id: 'custom', type: 'custom', custom: { name: 'lookup', input: 'source' } },
      ];
      const payload = {
        messages: [
          { role: 'assistant', tool_calls: calls },
          { role: 'tool', tool_call_id: 'missing', content: 'result' },
        ],
      };
      expect(applyPiRequestCompatibility(payload, 'openai-completions', modelId)).toEqual({
        messages: [
          {
            role: 'assistant',
            tool_calls: [
              {
                ...calls[0],
                extra_content: {
                  other: 'keep',
                  google: {
                    metadata: 'keep',
                    thought_signature: 'skip_thought_signature_validator',
                  },
                },
              },
              calls[1],
              calls[2],
            ],
          },
          payload.messages[1],
        ],
      });
      expect(calls[0].extra_content?.google).toEqual({ metadata: 'keep' });
    },
  );

  test.each([
    ['google-generative-ai', 'gemini-3-pro'],
    ['openai-responses', 'gemini-4-argon'],
    ['openai-completions', 'gemini-2.5-pro'],
    ['openai-completions', 'gpt-6.1-terra'],
  ] as const)('does not change %s requests for %s', (api, modelId) => {
    const payload = {
      messages: [{ role: 'assistant', tool_calls: [{ type: 'function', id: 'call' }] }],
    };
    expect(applyPiRequestCompatibility(payload, api, modelId)).toBe(payload);
  });
});

describe('Pi registry request parameters', () => {
  const qwen = { ...model, apiModelId: 'Qwen/Qwen3-32B' };

  test.each(['fireworks', 'custom', 'nvidia'])(
    'keeps the generic Qwen effort contract without guessing a native switch on %s',
    (providerId) => {
      const messages = [{ role: 'user', content: 'Question' }];
      for (const selection of ['off', 'high'] as const) {
        expect(
          apply(
            'openai-completions',
            REASONING_FORMAT_PROFILES['openai-chat'].wire,
            selection,
            { messages },
            { model: qwen, providerId },
          ),
        ).toEqual({
          messages,
          reasoning_effort: selection === 'off' ? 'none' : selection,
          temperature: 0.5,
        });
      }
    },
  );

  test.each(['default', undefined] as const)('keeps Qwen provider defaults for %s', (selection) => {
    const messages = [{ role: 'user', content: 'Question' }];
    expect(
      apply(
        'openai-completions',
        REASONING_FORMAT_PROFILES['openai-chat'].wire,
        selection,
        { messages },
        {
          model: qwen,
          providerId: 'gpustack',
        },
      ),
    ).toEqual({ messages, temperature: 0.5 });
  });

  test.each(['enable_thinking', 'chat_template_kwargs.enable_thinking'] as const)(
    'keeps an explicit Qwen %s wire declaration authoritative',
    (target) => {
      const profile: ReasoningWireProfile = {
        off: {
          operations: [
            {
              target,
              value: { source: 'literal', value: false },
            },
          ],
        },
      };
      expect(apply('openai-completions', profile, 'off', {}, { model: qwen })).toEqual({
        ...(target === 'enable_thinking'
          ? { enable_thinking: false }
          : { chat_template_kwargs: { enable_thinking: false } }),
        temperature: 0.5,
      });
    },
  );

  test('does not add a fallback to an explicit effort-only Qwen contract', () => {
    expect(
      apply(
        'openai-completions',
        {
          off: {
            operations: [
              { target: 'reasoningEffort', value: { source: 'literal', value: 'none' } },
            ],
          },
        },
        'off',
        {},
        { model: qwen },
      ),
    ).toEqual({ reasoning_effort: 'none', temperature: 0.5 });
  });

  test.each(['lmstudio', 'gpustack'])(
    'uses a soft switch for classic Qwen on a preset-backed %s copy without changing history',
    (providerId) => {
      const messages = [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Follow-up' },
            { type: 'image_url', image_url: { url: 'image' } },
          ],
        },
        { role: 'user', content: 'Already selected /think' },
      ];
      const result = apply(
        'openai-completions',
        REASONING_FORMAT_PROFILES['openai-chat'].wire,
        'off',
        { messages },
        {
          model: { ...qwen, providerId: 'copied-provider' },
          providerId,
        },
      );
      expect(result.messages).toEqual([
        { role: 'user', content: 'Question /no_think' },
        messages[1],
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Follow-up /no_think' },
            { type: 'image_url', image_url: { url: 'image' } },
          ],
        },
        messages[3],
      ]);
      expect(messages[0].content).toBe('Question');
      expect((messages[2].content as { text?: string }[])[0].text).toBe('Follow-up');
      expect(result).not.toHaveProperty('enable_thinking');
    },
  );

  test.each(['Qwen3.5-35B-A3B', 'Qwen3.8-Flash-Next', 'Qwen3-Coder-30B', 'Qwen2.5-32B'])(
    'does not add a classic soft switch to %s',
    (apiModelId) => {
      const messages = [{ role: 'user', content: 'Question' }];
      expect(
        apply(
          'openai-completions',
          REASONING_FORMAT_PROFILES['openai-chat'].wire,
          'off',
          { messages },
          {
            model: { ...qwen, apiModelId },
            providerId: 'lmstudio',
          },
        ).messages,
      ).toEqual(messages);
    },
  );

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

  test('uses the OpenAI Responses reasoning shape for Azure Responses', () => {
    const result = apply(
      'azure-openai-responses',
      REASONING_FORMAT_PROFILES['openai-responses'].wire,
      'high',
      { reasoning_effort: 'low' },
    );
    expect(result.reasoning).toEqual({ effort: 'high' });
    expect(result).not.toHaveProperty('reasoning_effort');
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

  test('keeps always-on adaptive thinking active for the default selection', () => {
    const profile = selectFormatWire(REASONING_FORMAT_PROFILES.anthropic, 'adaptive-always');
    expect(profile.off).toBeUndefined();
    expect(apply('anthropic-messages', profile, 'default', { max_tokens: 8192 })).toEqual({
      thinking: { type: 'adaptive', display: 'summarized' },
      max_tokens: 4096,
    });
    expect(apply('anthropic-messages', profile, 'high').output_config).toEqual({ effort: 'high' });
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
