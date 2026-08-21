import {
  encodeReasoningInvocation,
  resolveReasoningInvocation,
} from '@cherrystudio/ai-runtime/utils';
import {
  type EndpointType,
  type ProtoReasoningSupport,
  REASONING_FORMAT_PROFILES,
  REASONING_WIRE_TARGETS,
  type ReasoningWireProfile,
} from '@cherrystudio/provider-registry';
import { MobileRegistryLoader } from '@cherrystudio/provider-registry/mobile';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

import {
  projectRuntimeReasoning,
  providerRegistryService,
  resolveReasoningProfileFromRegistry,
} from '@/backend/data/services/ProviderRegistryService';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

type WireLeaf = string | number | boolean;
type FlatWire = Record<string, WireLeaf>;

type MatrixSample = {
  endpointType?: EndpointType;
  expected: Record<string, FlatWire>;
  group: string;
  modelId: string;
  providerId: string;
};

function flattenWireObject(
  input: Record<string, unknown>,
  prefix = '',
  result: FlatWire = {},
): FlatWire {
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flattenWireObject(value as Record<string, unknown>, path, result);
    } else {
      result[path] = value as WireLeaf;
    }
  }
  return result;
}

function resolveSample(sample: Pick<MatrixSample, 'endpointType' | 'modelId' | 'providerId'>) {
  const preset = providerRegistryService
    .loadProviders()
    .find((provider) => provider.id === sample.providerId);
  if (!preset) throw new Error(`Missing registry provider ${sample.providerId}`);

  const model = providerRegistryService.resolveModels(sample.providerId, [sample.modelId], {
    defaultChatEndpoint: sample.endpointType ?? preset.defaultChatEndpoint ?? undefined,
    presetProviderId: sample.providerId,
  })[0];
  if (!model) throw new Error(`Missing registry model ${sample.providerId}/${sample.modelId}`);

  const endpointType =
    sample.endpointType ?? model.endpointTypes?.[0] ?? preset.defaultChatEndpoint ?? undefined;
  const profile = providerRegistryService.resolveReasoningProfile(
    {
      defaultChatEndpoint: endpointType,
      id: sample.providerId,
      presetProviderId: sample.providerId,
    },
    model,
    endpointType,
  );
  const invocationModel = profile.support
    ? { ...model, reasoning: projectRuntimeReasoning(profile.support, profile.wire) }
    : model;

  return { model: invocationModel, profile: profile.wire };
}

const matrix: MatrixSample[] = [
  {
    group: '1 OpenAI responses',
    providerId: 'openai',
    modelId: 'gpt-5.4',
    expected: {
      default: {},
      none: { reasoningEffort: 'none', reasoningSummary: 'detailed' },
      low: { reasoningEffort: 'low', reasoningSummary: 'detailed' },
      medium: { reasoningEffort: 'medium', reasoningSummary: 'detailed' },
      high: { reasoningEffort: 'high', reasoningSummary: 'detailed' },
      xhigh: { reasoningEffort: 'xhigh', reasoningSummary: 'detailed' },
    },
  },
  {
    group: '2 Anthropic budget',
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    expected: {
      default: {},
      none: { 'thinking.type': 'disabled' },
      low: {
        'thinking.type': 'enabled',
        'thinking.budgetTokens': 4172,
        sendReasoning: true,
      },
      medium: {
        'thinking.type': 'enabled',
        'thinking.budgetTokens': 8191,
        sendReasoning: true,
      },
      high: {
        'thinking.type': 'enabled',
        'thinking.budgetTokens': 8191,
        sendReasoning: true,
      },
    },
  },
  {
    group: '2 Anthropic adaptive',
    providerId: 'anthropic',
    modelId: 'claude-opus-4-7',
    expected: {
      default: {},
      low: { 'thinking.type': 'adaptive', 'thinking.display': 'summarized', effort: 'low' },
      medium: {
        'thinking.type': 'adaptive',
        'thinking.display': 'summarized',
        effort: 'medium',
      },
      high: { 'thinking.type': 'adaptive', 'thinking.display': 'summarized', effort: 'high' },
      xhigh: {
        'thinking.type': 'adaptive',
        'thinking.display': 'summarized',
        effort: 'xhigh',
      },
      max: { 'thinking.type': 'adaptive', 'thinking.display': 'summarized', effort: 'max' },
      none: { 'thinking.type': 'disabled' },
    },
  },
  {
    group: '3 Gemini budget',
    providerId: 'gemini',
    modelId: 'gemini-2.5-flash',
    expected: {
      default: {},
      none: { 'thinkingConfig.includeThoughts': false, 'thinkingConfig.thinkingBudget': 0 },
      low: { 'thinkingConfig.includeThoughts': true, 'thinkingConfig.thinkingBudget': 1228 },
      medium: {
        'thinkingConfig.includeThoughts': true,
        'thinkingConfig.thinkingBudget': 12288,
      },
      high: {
        'thinkingConfig.includeThoughts': true,
        'thinkingConfig.thinkingBudget': 19660,
      },
    },
  },
  {
    group: '3 Gemini level',
    providerId: 'gemini',
    modelId: 'gemini-3-flash-preview',
    expected: {
      default: {},
      minimal: {
        'thinkingConfig.includeThoughts': true,
        'thinkingConfig.thinkingLevel': 'minimal',
      },
      low: { 'thinkingConfig.includeThoughts': true, 'thinkingConfig.thinkingLevel': 'low' },
      medium: {
        'thinkingConfig.includeThoughts': true,
        'thinkingConfig.thinkingLevel': 'medium',
      },
      high: { 'thinkingConfig.includeThoughts': true, 'thinkingConfig.thinkingLevel': 'high' },
    },
  },
  {
    group: '4 Grok effort',
    providerId: 'grok',
    modelId: 'grok-4.3',
    expected: {
      default: {},
      none: { reasoningEffort: 'none' },
      low: { reasoningEffort: 'low' },
      medium: { reasoningEffort: 'medium' },
      high: { reasoningEffort: 'high' },
    },
  },
  {
    group: '5 Bedrock budget',
    providerId: 'aws-bedrock',
    modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    expected: {
      default: {},
      none: { 'reasoningConfig.type': 'disabled' },
      low: { 'reasoningConfig.type': 'enabled', 'reasoningConfig.budgetTokens': 4172 },
      medium: { 'reasoningConfig.type': 'enabled', 'reasoningConfig.budgetTokens': 8191 },
      high: { 'reasoningConfig.type': 'enabled', 'reasoningConfig.budgetTokens': 8191 },
    },
  },
  {
    group: '5 Bedrock adaptive',
    providerId: 'aws-bedrock',
    modelId: 'global.anthropic.claude-opus-4-7',
    expected: {
      default: {},
      low: { 'reasoningConfig.type': 'adaptive', 'reasoningConfig.maxReasoningEffort': 'low' },
      medium: {
        'reasoningConfig.type': 'adaptive',
        'reasoningConfig.maxReasoningEffort': 'medium',
      },
      high: {
        'reasoningConfig.type': 'adaptive',
        'reasoningConfig.maxReasoningEffort': 'high',
      },
      xhigh: {
        'reasoningConfig.type': 'adaptive',
        'reasoningConfig.maxReasoningEffort': 'xhigh',
      },
      max: { 'reasoningConfig.type': 'adaptive', 'reasoningConfig.maxReasoningEffort': 'max' },
      none: { 'reasoningConfig.type': 'disabled' },
    },
  },
  {
    group: '6 Ollama think',
    providerId: 'ollama',
    modelId: 'qwen3-8b',
    endpointType: 'ollama-chat',
    expected: {
      default: {},
      none: { think: false },
      low: { think: 'low' },
      medium: { think: 'medium' },
      high: { think: 'high' },
    },
  },
  {
    group: '7 DashScope flat',
    providerId: 'dashscope',
    modelId: 'qwen-flash',
    expected: {
      default: {},
      none: { enable_thinking: false },
      low: { enable_thinking: true, thinking_budget: 4096 },
      medium: { enable_thinking: true, thinking_budget: 40960 },
      high: { enable_thinking: true, thinking_budget: 65536 },
    },
  },
  {
    group: '7 NVIDIA budget',
    providerId: 'nvidia',
    modelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    expected: {
      default: {},
      low: { reasoning_budget: 1638 },
      medium: { reasoning_budget: 8191 },
      high: { reasoning_budget: 8191 },
    },
  },
  {
    group: '7 Cerebras toggle',
    providerId: 'cerebras',
    modelId: 'glm-5',
    expected: { default: {}, none: { disable_reasoning: true } },
  },
  {
    group: '8 OpenRouter reasoning object',
    providerId: 'openrouter',
    modelId: 'openai/gpt-5.4',
    expected: {
      default: {},
      xhigh: { 'reasoning.effort': 'xhigh' },
      high: { 'reasoning.effort': 'high' },
      medium: { 'reasoning.effort': 'medium' },
      low: { 'reasoning.effort': 'low' },
      none: { 'reasoning.effort': 'none' },
    },
  },
  {
    group: '8 Together reasoning object',
    providerId: 'together',
    modelId: 'zai-org/GLM-5',
    expected: {
      default: {},
      none: { 'reasoning.enabled': false },
      auto: { 'reasoning.enabled': true },
    },
  },
  {
    group: '9 MiniMax thinking object',
    providerId: 'dashscope',
    modelId: 'minimax-m3',
    expected: {
      default: {},
      none: { 'thinking.type': 'disabled' },
      auto: { 'thinking.type': 'adaptive' },
    },
  },
  {
    group: '9 DeepSeek thinking object',
    providerId: 'deepseek',
    modelId: 'deepseek-v4-pro',
    expected: {
      default: {},
      none: { 'thinking.type': 'disabled' },
      high: { 'thinking.type': 'enabled', reasoning_effort: 'high' },
      max: { 'thinking.type': 'enabled', reasoning_effort: 'max' },
      xhigh: { 'thinking.type': 'enabled', reasoning_effort: 'max' },
    },
  },
  {
    group: '9 Zhipu thinking object',
    providerId: 'zhipu',
    modelId: 'glm-5-2',
    expected: {
      default: {},
      none: { 'thinking.type': 'disabled' },
      high: { 'thinking.type': 'enabled', reasoningEffort: 'high' },
      max: { 'thinking.type': 'enabled', reasoningEffort: 'max' },
    },
  },
  {
    group: '10 NVIDIA Qwen chat template',
    providerId: 'nvidia',
    modelId: 'qwen/qwen3.5-122b-a10b',
    expected: {
      default: {},
      none: { 'chat_template_kwargs.enable_thinking': false },
      auto: { 'chat_template_kwargs.enable_thinking': true },
    },
  },
  {
    group: '10 NVIDIA Kimi chat template',
    providerId: 'nvidia',
    modelId: 'moonshotai/kimi-k2.6',
    expected: {
      default: {},
      none: { 'chat_template_kwargs.thinking': false },
      auto: { 'chat_template_kwargs.thinking': true },
    },
  },
  {
    group: '10 NVIDIA MiniMax chat template',
    providerId: 'nvidia',
    modelId: 'minimaxai/minimax-m3',
    expected: {
      default: {},
      none: { 'chat_template_kwargs.thinking_mode': 'disabled' },
      auto: { 'chat_template_kwargs.thinking_mode': 'adaptive' },
    },
  },
  {
    group: '11 Poe OpenAI extra body',
    providerId: 'poe',
    modelId: 'GPT-5.4',
    expected: {
      default: {},
      none: { 'extra_body.reasoning_effort': 'none' },
      low: { 'extra_body.reasoning_effort': 'low' },
      medium: { 'extra_body.reasoning_effort': 'medium' },
      high: { 'extra_body.reasoning_effort': 'high' },
      xhigh: { 'extra_body.reasoning_effort': 'xhigh' },
    },
  },
  {
    group: '11 Poe Claude fallback extra body',
    providerId: 'poe',
    modelId: 'Claude-Opus-4.7',
    endpointType: 'openai-chat-completions',
    expected: {
      default: {},
      low: { 'extra_body.thinking_budget': 7372 },
      medium: { 'extra_body.thinking_budget': 64512 },
      high: { 'extra_body.thinking_budget': 102604 },
      xhigh: { 'extra_body.thinking_budget': 115302 },
      max: { 'extra_body.thinking_budget': 128000 },
    },
  },
  {
    group: '11 CherryIn DeepSeek extra body',
    providerId: 'cherryin',
    modelId: 'deepseek-chat',
    expected: {
      default: {},
      none: { 'extra_body.thinking.type': 'disabled' },
      auto: { 'extra_body.thinking.type': 'enabled' },
    },
  },
];

describe('reasoning registry wire matrix', () => {
  it.each(matrix)('$group: $providerId/$modelId', (sample) => {
    const { model, profile } = resolveSample(sample);
    const selections = [
      'default',
      ...(model.reasoning?.selectableEfforts ?? []),
    ] as ReasoningEffortOption[];

    expect(selections).toEqual(Object.keys(sample.expected));
    for (const selection of selections) {
      const invocation = resolveReasoningInvocation({
        assistantSummary: 'detailed',
        maxTokens: 8192,
        model,
        profile,
        selection,
      });
      expect(flattenWireObject(encodeReasoningInvocation(invocation))).toEqual(
        sample.expected[selection],
      );
    }
  });

  it.each([
    ['zhipu', 'glm-5-2', 'xhigh', { 'thinking.type': 'enabled', reasoningEffort: 'max' }],
    ['grok', 'grok-4.3', 'max', { reasoningEffort: 'high' }],
  ] as const)(
    'maps %s/%s %s to the nearest declared tier',
    (providerId, modelId, selection, expected) => {
      const { model, profile } = resolveSample({ providerId, modelId });
      const invocation = resolveReasoningInvocation({ model, profile, selection });
      expect(flattenWireObject(encodeReasoningInvocation(invocation))).toEqual(expected);
    },
  );
});

const completeReasoning = {
  controls: [
    {
      kind: 'effort',
      values: ['none', 'auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
    { kind: 'budget', min: 0, max: 128_000 },
    { kind: 'toggle' },
  ],
  thinkingTokenLimits: { min: 0, max: 128_000 },
} satisfies ProtoReasoningSupport;

function createCatalogModel(id: string, profile: ReasoningWireProfile): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('catalog', id),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: id,
    name: id,
    providerId: 'catalog',
    reasoning: projectRuntimeReasoning(completeReasoning, profile),
    supportsStreaming: true,
  };
}

type CatalogCase = { label: string; model: Model; profile: ReasoningWireProfile };

function buildCatalogCases(): CatalogCase[] {
  const cases: CatalogCase[] = Object.entries(REASONING_FORMAT_PROFILES).map(
    ([format, profile]) => ({
      label: `global/${format}`,
      model: createCatalogModel(`global-${format}`, profile.wire),
      profile: profile.wire,
    }),
  );
  const loader = new MobileRegistryLoader();

  for (const provider of loader.loadProviders()) {
    for (const [endpointType, config] of Object.entries(provider.endpointConfigs ?? {})) {
      if (!config.reasoningFormat) continue;
      const resolved = resolveReasoningProfileFromRegistry({
        endpointType: endpointType as EndpointType,
        format: config.reasoningFormat,
      });
      cases.push({
        label: `endpoint/${provider.id}/${endpointType}`,
        model: createCatalogModel(`endpoint-${provider.id}-${endpointType}`, resolved.wire),
        profile: resolved.wire,
      });
    }
  }

  for (const override of loader.loadProviderModels()) {
    for (const endpointType of Object.keys(override.reasoningContracts ?? {}) as EndpointType[]) {
      const modelId = override.apiModelId ?? override.modelId;
      const resolved = resolveSample({ providerId: override.providerId, modelId, endpointType });
      cases.push({
        label: `contract/${override.providerId}/${modelId}/${endpointType}`,
        ...resolved,
      });
    }
  }

  return cases;
}

describe('reasoning profile catalog', () => {
  it.each(buildCatalogCases())('$label resolves every exposed selection', ({ model, profile }) => {
    const selections = [
      'default',
      ...(model.reasoning?.selectableEfforts ?? []),
    ] as ReasoningEffortOption[];

    for (const selection of selections) {
      const invocation = resolveReasoningInvocation({
        assistantSummary: 'detailed',
        maxTokens: 1_000_000,
        model,
        profile,
        selection,
      });
      const encoded = encodeReasoningInvocation(invocation);

      if (invocation.kind === 'omit') {
        expect(encoded).toEqual({});
        continue;
      }

      expect(invocation.emissions.length).toBeGreaterThan(0);
      for (const emission of invocation.emissions) {
        expect(REASONING_WIRE_TARGETS).toContain(emission.target);
        expect(flattenWireObject(encoded)[emission.target]).toBe(emission.value);
      }
    }
  });

  it('materializes every closed target at its declared path', () => {
    for (const target of REASONING_WIRE_TARGETS) {
      const encoded = encodeReasoningInvocation({
        emissions: [{ target, value: true }],
        kind: 'effort',
        selection: 'high',
      });
      expect(flattenWireObject(encoded)).toEqual({ [target]: true });
    }
  });
});
