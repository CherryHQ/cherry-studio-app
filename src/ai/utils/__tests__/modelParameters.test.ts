import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { Assistant } from '@/data/types/assistant';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/data/types/assistant';
import { createUniqueModelId, type Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { filterStandardParams, getMaxTokens, getTemperature, getTopP } from '../modelParameters';

// modelParameters tests treat `enableTemperature: true` as the baseline,
// unlike DEFAULT_ASSISTANT_SETTINGS which has it false. Local wrapper keeps
// per-test settings calls terse.
function createAssistant(overrides: Partial<Assistant['settings']> = {}): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '',
    id: '00000000-0000-4000-8000-000000000001',
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'Assistant',
    prompt: '',
    settings: { ...DEFAULT_ASSISTANT_SETTINGS, enableTemperature: true, ...overrides },
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createModel(modelId: string, overrides: Partial<Model> = {}): Model {
  const providerId = overrides.providerId ?? 'openai';
  return {
    capabilities: [],
    id: createUniqueModelId(providerId, modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
    ...overrides,
  };
}

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      developerRole: true,
      enableThinking: false,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
    },
    apiKeys: [],
    authType: 'api-key',
    id: 'openai',
    isEnabled: true,
    name: 'OpenAI',
    settings: {},
    ...overrides,
  };
}

describe('getTemperature', () => {
  it('returns undefined when enableTemperature is false', () => {
    const a = createAssistant({ enableTemperature: false, temperature: 0.7 });
    expect(getTemperature(a, createModel('gpt-4o'))).toBeUndefined();
  });

  it('returns the temperature when the model supports it', () => {
    const a = createAssistant({ temperature: 0.5 });
    expect(getTemperature(a, createModel('gpt-4o'))).toBe(0.5);
  });

  it('disables temperature on Claude reasoning models with non-default reasoning effort', () => {
    const a = createAssistant({ temperature: 0.8, reasoning_effort: 'high' });
    const model = createModel('claude-sonnet-4-5-20250101', {
      providerId: 'anthropic',
      capabilities: [MODEL_CAPABILITY.REASONING],
    });
    expect(getTemperature(a, model)).toBeUndefined();
  });

  it('keeps temperature on Claude reasoning models when reasoning_effort is default', () => {
    const a = createAssistant({ temperature: 0.8, reasoning_effort: 'default' });
    const model = createModel('claude-sonnet-4-5-20250101', {
      providerId: 'anthropic',
      capabilities: [MODEL_CAPABILITY.REASONING],
    });
    expect(getTemperature(a, model)).toBe(0.8);
  });

  it('clamps temperature to 1 for isMaxTemperatureOneModel', () => {
    const a = createAssistant({ temperature: 1.5 });
    const model = createModel('gpt-5', {
      parameters: { temperature: { supported: true, range: { min: 0, max: 1 } } },
    });
    expect(getTemperature(a, model)).toBe(1);
  });

  it('disables temperature for Gemini 3.x models', () => {
    const a = createAssistant({ temperature: 0.8 });
    const model = createModel('gemini-3-pro', { providerId: 'gemini' });
    expect(getTemperature(a, model)).toBeUndefined();
  });

  it('disables temperature for Claude Opus 4.7 models', () => {
    const a = createAssistant({ temperature: 0.8 });
    const model = createModel('claude-opus-4-7-20260101', { providerId: 'anthropic' });
    expect(getTemperature(a, model)).toBeUndefined();
  });
});

describe('getTopP', () => {
  it('returns undefined when enableTopP is false', () => {
    const a = createAssistant({ enableTopP: false, topP: 0.9 });
    expect(getTopP(a, createModel('gpt-4o'))).toBeUndefined();
  });

  it('returns topP when enabled', () => {
    const a = createAssistant({ enableTopP: true, topP: 0.9 });
    expect(getTopP(a, createModel('gpt-4o'))).toBe(0.9);
  });

  it('clamps topP to [0.95, 1] on Claude reasoning models with reasoning effort', () => {
    // Claude 4.5 has mutually-exclusive temperature/topP; leaving both
    // enabled would short-circuit topP via the exclusivity branch and never
    // reach the reasoning-clamp path under test.
    const a = createAssistant({
      enableTemperature: false,
      enableTopP: true,
      topP: 0.5,
      reasoning_effort: 'high',
    });
    const model = createModel('claude-sonnet-4-5-20250101', {
      providerId: 'anthropic',
      capabilities: [MODEL_CAPABILITY.REASONING],
    });
    expect(getTopP(a, model)).toBe(0.95);
  });

  it('disables topP for Gemini 3.x models', () => {
    const a = createAssistant({ enableTopP: true, topP: 0.8 });
    const model = createModel('gemini-3-pro', { providerId: 'gemini' });
    expect(getTopP(a, model)).toBeUndefined();
  });

  it('disables topP for Claude Opus 4.7 models', () => {
    const a = createAssistant({ enableTopP: true, topP: 0.8 });
    const model = createModel('claude-opus-4-7-20260101', { providerId: 'anthropic' });
    expect(getTopP(a, model)).toBeUndefined();
  });

  it('disables topP on mutually-exclusive models when temperature is also enabled', () => {
    const a = createAssistant({ enableTemperature: true, enableTopP: true, topP: 0.8 });
    const model = createModel('claude-sonnet-4-5-20250101', { providerId: 'anthropic' });
    expect(getTopP(a, model)).toBeUndefined();
  });
});

describe('filterStandardParams', () => {
  it('drops topK for Gemini 3.x models', () => {
    const model = createModel('gemini-3-pro', { providerId: 'gemini' });
    expect(filterStandardParams({ topK: 40, frequencyPenalty: 0.1 }, model)).toEqual({
      frequencyPenalty: 0.1,
    });
  });

  it('drops topK for Claude Opus 4.7 models', () => {
    const model = createModel('claude-opus-4-7-20260101', { providerId: 'anthropic' });
    expect(filterStandardParams({ topK: 40, frequencyPenalty: 0.1 }, model)).toEqual({
      frequencyPenalty: 0.1,
    });
  });

  it('keeps topK for other models', () => {
    const input = { topK: 40 };
    expect(filterStandardParams(input, createModel('gpt-4o'))).toBe(input);
  });
});

describe('getMaxTokens', () => {
  it('returns undefined when enableMaxTokens is off', () => {
    const a = createAssistant({ enableMaxTokens: false, maxTokens: 2048 });
    expect(getMaxTokens(a, createModel('gpt-4o'), createProvider())).toBeUndefined();
  });

  it('returns maxTokens when enabled on non-Claude models', () => {
    const a = createAssistant({ enableMaxTokens: true, maxTokens: 2048 });
    expect(getMaxTokens(a, createModel('gpt-4o'), createProvider())).toBe(2048);
  });

  it('skips budget subtraction on Claude 4.6 series (adaptive thinking)', () => {
    const a = createAssistant({ enableMaxTokens: true, maxTokens: 8000, reasoning_effort: 'high' });
    const model = createModel('claude-sonnet-4-6-20260101', { providerId: 'anthropic' });
    const provider = createProvider({ id: 'anthropic', presetProviderId: 'anthropic' });
    expect(getMaxTokens(a, model, provider)).toBe(8000);
  });

  it('skips budget subtraction on Claude Opus 4.7 series (adaptive thinking)', () => {
    const a = createAssistant({ enableMaxTokens: true, maxTokens: 8000, reasoning_effort: 'high' });
    const model = createModel('claude-opus-4-7-20260101', { providerId: 'anthropic' });
    const provider = createProvider({ id: 'anthropic', presetProviderId: 'anthropic' });
    expect(getMaxTokens(a, model, provider)).toBe(8000);
  });

  it('subtracts the thinking budget on pre-4.6 Claude thinking models', () => {
    const a = createAssistant({ enableMaxTokens: true, maxTokens: 8000, reasoning_effort: 'high' });
    const model = createModel('claude-3-7-sonnet-20250219', {
      providerId: 'anthropic',
      reasoning: { type: 'thinking', thinkingTokenLimits: { min: 1024, max: 64000 } },
    });
    const provider = createProvider({ id: 'anthropic', presetProviderId: 'anthropic' });
    expect(getMaxTokens(a, model, provider)).toBeLessThan(8000);
  });

  it('skips budget subtraction on non-Anthropic-like providers even for Claude-named thinking models', () => {
    // e.g. a Claude model relayed through an openai-compatible aggregator —
    // the AI SDK doesn't add a Claude thinking budget on top there.
    const a = createAssistant({ enableMaxTokens: true, maxTokens: 8000, reasoning_effort: 'high' });
    const model = createModel('claude-3-7-sonnet-20250219', {
      providerId: 'anthropic',
      reasoning: { type: 'thinking', thinkingTokenLimits: { min: 1024, max: 64000 } },
    });
    const provider = createProvider({ id: 'openrouter' });
    expect(getMaxTokens(a, model, provider)).toBe(8000);
  });
});
