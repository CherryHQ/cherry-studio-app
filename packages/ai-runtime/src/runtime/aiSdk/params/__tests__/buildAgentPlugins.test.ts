import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { LanguageModelMiddleware } from 'ai';

import type { ResolvedReasoningInvocation } from '../../../../utils/reasoningSerializers';
import { buildAgentPlugins } from '../buildAgentPlugins';

describe('buildAgentPlugins reasoning features', () => {
  test('installs Anthropic caching from endpoint semantics with shared defaults', () => {
    const names = buildAgentPlugins({
      aiSdkProviderId: 'anthropic',
      endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      hasMcpTools: false,
      hasReasoningSelectionSource: false,
      model: createModel('proxy', 'custom-model'),
      provider: createProvider('proxy'),
      reasoning: omitInvocation(),
      streamOutput: true,
    }).map((plugin) => plugin.name);

    expect(names).toContain('anthropic-cache');
  });

  test.each([
    [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, undefined],
    [ENDPOINT_TYPE.ANTHROPIC_MESSAGES, { enabled: false, tokenThreshold: 1024 }],
    [ENDPOINT_TYPE.ANTHROPIC_MESSAGES, { enabled: true, tokenThreshold: 0 }],
  ])(
    'does not install Anthropic caching for endpoint/settings case %#',
    (endpointType, cacheControl) => {
      const provider = createProvider('proxy');
      provider.settings.cacheControl = cacheControl;

      expect(
        buildAgentPlugins({
          aiSdkProviderId: 'anthropic',
          endpointType,
          hasMcpTools: false,
          hasReasoningSelectionSource: false,
          model: createModel('proxy', 'claude-compatible'),
          provider,
          reasoning: omitInvocation(),
          streamOutput: true,
        }).map((plugin) => plugin.name),
      ).not.toContain('anthropic-cache');
    },
  );

  test('threads the raw assistant prompt into Anthropic caching', async () => {
    const plugins = buildAgentPlugins({
      aiSdkProviderId: 'anthropic',
      assistant: { prompt: 'Current time: {{datetime}}' } as Assistant,
      endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      hasMcpTools: false,
      hasReasoningSelectionSource: false,
      model: createModel('anthropic', 'claude-sonnet'),
      provider: createProvider('anthropic'),
      reasoning: omitInvocation(),
      streamOutput: true,
    });
    const result = await transformPrompt(plugins, 'anthropic-cache', [
      { content: 'x '.repeat(3000), role: 'system' },
    ]);

    expect(result?.prompt?.[0]?.providerOptions).toBeUndefined();
  });

  test.each([
    [offInvocation(), 'hello /no_think'],
    [onInvocation(), 'hello /think'],
  ])('drives the Qwen prompt suffix from the resolved invocation', async (reasoning, expected) => {
    const plugins = buildAgentPlugins({
      aiSdkProviderId: 'openai-compatible',
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      hasMcpTools: false,
      hasReasoningSelectionSource: true,
      model: createQwenModel('qwen3-32b'),
      provider: createProvider('nvidia'),
      reasoning,
      streamOutput: true,
    });

    expect(await transformUserText(plugins, 'qwen-thinking')).toBe(expected);
  });

  test.each([
    ['Qwen 3.5', createProvider('nvidia'), createQwenModel('qwen3.5-32b'), onInvocation()],
    ['Ollama', createProvider('ollama'), createQwenModel('qwen3-32b'), onInvocation()],
    [
      'omitted invocation',
      createProvider('nvidia'),
      createQwenModel('qwen3-32b'),
      omitInvocation(),
    ],
  ])('does not add the Qwen prompt middleware for %s', (_name, provider, model, reasoning) => {
    expect(
      buildAgentPlugins({
        aiSdkProviderId: 'openai-compatible',
        endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        hasMcpTools: false,
        hasReasoningSelectionSource: true,
        model,
        provider,
        reasoning,
        streamOutput: true,
      }).map((plugin) => plugin.name),
    ).not.toContain('qwen-thinking');
  });

  test('extracts tagged reasoning for an AiHubMix compat chat endpoint', () => {
    expect(
      buildAgentPlugins({
        aiSdkProviderId: 'aihubmix',
        endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        hasMcpTools: false,
        hasReasoningSelectionSource: true,
        model: createQwenModel('glm-5'),
        provider: createProvider('aihubmix'),
        reasoning: onInvocation(),
        streamOutput: true,
      }).map((plugin) => plugin.name),
    ).toContain('reasoning-extraction');
  });

  test('does not extract tagged text from a native reasoning endpoint', () => {
    expect(
      buildAgentPlugins({
        aiSdkProviderId: 'openai-compatible',
        endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
        hasMcpTools: false,
        hasReasoningSelectionSource: true,
        model: createQwenModel('gpt-5.4'),
        provider: createProvider('openai'),
        reasoning: onInvocation(),
        streamOutput: true,
      }).map((plugin) => plugin.name),
    ).not.toContain('reasoning-extraction');
  });

  test('orders reasoning extraction before simulated streaming', () => {
    const names = buildAgentPlugins({
      aiSdkProviderId: 'openai-compatible',
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      hasMcpTools: false,
      hasReasoningSelectionSource: true,
      model: createModel('provider', 'glm-5'),
      provider: createProvider('provider'),
      reasoning: onInvocation(),
      streamOutput: false,
    }).map((plugin) => plugin.name);

    expect(names.indexOf('reasoning-extraction')).toBeLessThan(names.indexOf('simulate-streaming'));
  });

  test('installs the DeepSeek DSML parser before reasoning extraction', () => {
    const names = buildAgentPlugins({
      aiSdkProviderId: 'openai-compatible',
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      hasMcpTools: false,
      hasReasoningSelectionSource: true,
      model: createModel('custom', 'deepseek-v3'),
      provider: createProvider('custom'),
      reasoning: onInvocation(),
      streamOutput: true,
    }).map((plugin) => plugin.name);

    expect(names.indexOf('deepseekDsmlParser')).toBeLessThan(names.indexOf('reasoning-extraction'));
  });

  test('does not install the DSML parser for unrelated models', () => {
    expect(
      buildAgentPlugins({
        aiSdkProviderId: 'openai-compatible',
        endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        hasMcpTools: false,
        hasReasoningSelectionSource: true,
        model: createModel('openai', 'gpt-4o'),
        provider: createProvider('openai'),
        reasoning: onInvocation(),
        streamOutput: true,
      }).map((plugin) => plugin.name),
    ).not.toContain('deepseekDsmlParser');
  });

  test('adds the OVMS no-think suffix only when MCP tools participate', async () => {
    const plugins = buildAgentPlugins({
      aiSdkProviderId: 'openai-compatible',
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      hasMcpTools: true,
      hasReasoningSelectionSource: true,
      model: createModel('ovms', 'qwen3-8b'),
      provider: createProvider('ovms'),
      reasoning: onInvocation(),
      streamOutput: true,
    });

    expect(await transformUserText(plugins, 'no-think')).toBe('hello /no_think');

    expect(
      buildAgentPlugins({
        aiSdkProviderId: 'openai-compatible',
        endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        hasMcpTools: false,
        hasReasoningSelectionSource: true,
        model: createModel('ovms', 'qwen3-8b'),
        provider: createProvider('ovms'),
        reasoning: onInvocation(),
        streamOutput: true,
      }).map((plugin) => plugin.name),
    ).not.toContain('no-think');
  });

  test('adds a replay thought signature to Gemini 3 tool calls', async () => {
    const plugins = buildAgentPlugins({
      aiSdkProviderId: 'openai-compatible',
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      hasMcpTools: false,
      hasReasoningSelectionSource: true,
      model: createModel('provider', 'gemini-3-flash-preview'),
      provider: createProvider('provider'),
      reasoning: onInvocation(),
      streamOutput: true,
    });
    const result = await transformPrompt(plugins, 'skip-gemini-thought-signature', [
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'search', input: '{}' }],
      },
    ]);
    const message = result?.prompt?.[0];
    const part = message?.role === 'assistant' ? message.content[0] : undefined;

    expect(part?.providerOptions).toMatchObject({
      openaiCompatible: {
        extra_content: {
          google: { thought_signature: 'skip_thought_signature_validator' },
        },
      },
    });
  });
});

async function transformUserText(
  plugins: ReturnType<typeof buildAgentPlugins>,
  pluginName: string,
): Promise<string | undefined> {
  const result = await transformPrompt(plugins, pluginName, [
    { role: 'user', content: [{ type: 'text', text: 'hello' }] },
  ]);
  const message = result?.prompt?.[0];
  const part =
    message?.role === 'user' && Array.isArray(message.content) ? message.content[0] : null;
  return part?.type === 'text' ? part.text : undefined;
}

async function transformPrompt(
  plugins: ReturnType<typeof buildAgentPlugins>,
  pluginName: string,
  prompt: unknown[],
) {
  const plugin = plugins.find((candidate) => candidate.name === pluginName);
  const context = { middlewares: [] as LanguageModelMiddleware[] };
  plugin?.configureContext?.(context as never);
  return context.middlewares[0]?.transformParams?.({
    params: { prompt },
    type: 'generate',
  } as never);
}

function createQwenModel(modelId: string): Model {
  return {
    ...createModel('nvidia', modelId),
    reasoning: {
      selectableEfforts: ['none', 'auto'],
      thinkingTokenLimits: { max: 38_912, min: 1024 },
    },
  };
}

function createModel(providerId: string, modelId: string): Model {
  return {
    capabilities: [],
    id: `${providerId}::${modelId}` as UniqueModelId,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
  };
}

function createProvider(id: string): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      reportsActualCost: false,
      serviceTier: false,
      streamOptions: true,
      verbosity: false,
    },
    apiKeys: [],
    authType: 'api-key',
    endpointConfigs: {},
    id,
    isEnabled: true,
    name: id,
    settings: {},
  };
}

function offInvocation(): ResolvedReasoningInvocation {
  return {
    emissions: [{ target: 'enable_thinking', value: false }],
    kind: 'off',
    selection: 'none',
  };
}

function onInvocation(): ResolvedReasoningInvocation {
  return {
    emissions: [{ target: 'enable_thinking', value: true }],
    kind: 'auto',
    selection: 'auto',
  };
}

function omitInvocation(): ResolvedReasoningInvocation {
  return { emissions: [], kind: 'omit', selection: 'default' };
}
