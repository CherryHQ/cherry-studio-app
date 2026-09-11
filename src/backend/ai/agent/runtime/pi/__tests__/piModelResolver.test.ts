import {
  ENDPOINT_TYPE,
  MODEL_CAPABILITY,
  type EndpointType,
} from '@cherrystudio/provider-registry';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import type { Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { createPiModelResolver, toPiModelPreflight } from '../piModelResolver';
import type { PiRuntimeDependencies } from '../PiRuntime';

type BindPiStream = typeof import('../piApiAdapters').bindPiStream;

const mockGetModelById = jest.fn();
const mockGetProviderById = jest.fn();
const mockResolveApiKey = jest.fn();
const mockBoundStreamFn = jest.fn();
const mockBindPiStream = jest.fn<ReturnType<BindPiStream>, Parameters<BindPiStream>>();

jest.mock('@/backend/data/services/ModelService', () => ({
  modelService: { getById: (...args: unknown[]) => mockGetModelById(...args) },
}));
jest.mock('@/backend/data/services/ProviderService', () => ({
  providerService: {
    getByProviderId: (...args: unknown[]) => mockGetProviderById(...args),
    resolveApiKey: (...args: unknown[]) => mockResolveApiKey(...args),
  },
}));
jest.mock('../piApiAdapters', () => {
  const actual = jest.requireActual('../piApiAdapters');
  return {
    ...actual,
    bindPiStream: (...args: Parameters<BindPiStream>) => mockBindPiStream(...args),
  };
});

const CREDENTIAL_RECEIPT = {
  attribution: 'explicit' as const,
  id: 'key-1',
  masked: 'secr****-key',
};

const CASES = [
  {
    adapterFamily: 'openai',
    api: 'openai-responses',
    baseUrl: 'https://responses.test',
    endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
    expectedBaseUrl: 'https://responses.test/v1',
    expectedModelId: 'models/test-model',
  },
  {
    adapterFamily: 'openai-compatible',
    api: 'openai-completions',
    baseUrl: 'https://chat.test/v1',
    endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    expectedBaseUrl: 'https://chat.test/v1',
    expectedModelId: 'models/test-model',
  },
  {
    adapterFamily: 'anthropic',
    api: 'anthropic-messages',
    baseUrl: 'https://anthropic.test/v1',
    endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
    expectedBaseUrl: 'https://anthropic.test',
    expectedModelId: 'models/test-model',
  },
  {
    adapterFamily: 'google',
    api: 'google-generative-ai',
    baseUrl: 'https://google.test',
    endpointType: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
    expectedBaseUrl: 'https://google.test/v1beta',
    expectedModelId: 'test-model',
  },
] as const;

beforeEach(installProviderRegistryTestSnapshot);

describe('Pi model resolver', () => {
  let resolver: PiRuntimeDependencies;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveApiKey.mockResolvedValue({
      apiKeySelection: CREDENTIAL_RECEIPT,
      value: 'secret-key',
    });
    mockBindPiStream.mockResolvedValue(mockBoundStreamFn);
    resolver = createPiModelResolver();
  });

  test.each(CASES)('resolves $endpointType through $api', async (testCase) => {
    const provider = makeProvider(testCase.endpointType, testCase.baseUrl, testCase.adapterFamily);
    const model = makeModel(testCase.endpointType);
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(model);

    const resolution = await resolve(resolver, { maxOutputTokens: 1024, temperature: 0.25 });

    expect(resolution.model).toMatchObject({
      api: testCase.api,
      baseUrl: testCase.expectedBaseUrl,
      contextWindow: 128_000,
      id: testCase.expectedModelId,
      input: ['text'],
      maxTokens: 4096,
      provider: 'test-provider',
      reasoning: true,
    });
    expect(resolution.model.compat).toEqual(
      testCase.api === 'openai-completions'
        ? {
            maxTokensField: 'max_tokens',
            supportsDeveloperRole: false,
            supportsStore: false,
            supportsStrictMode: false,
            supportsUsageInStreaming: provider.apiFeatures.streamOptions,
          }
        : testCase.api === 'openai-responses'
          ? { supportsDeveloperRole: false }
          : undefined,
    );
    expect(resolution.streamFn).toBe(mockBoundStreamFn);
    expect(resolution.supportsTools).toBe(true);
    expect(resolution.defaultThinkingLevel).toBe('high');
    expect(resolution.redactionValues).toEqual(['secret-key', 'Bearer header-secret']);
    expect(resolution.usageContext).toMatchObject({
      credentialReceipt: CREDENTIAL_RECEIPT,
      modelId: testCase.expectedModelId,
      providerId: 'test-provider',
    });
    expect(mockBindPiStream).toHaveBeenCalledWith(
      expect.objectContaining({ api: testCase.api }),
      expect.objectContaining({
        apiKey: 'secret-key',
        headers: expect.objectContaining({
          Authorization: 'Bearer header-secret',
          'X-App-Name': 'CherryStudioMobile',
          'X-Custom': 'custom',
        }),
        maxRetries: 0,
        maxTokens: 1024,
        temperature: 0.25,
        timeoutMs: 600_000,
      }),
    );
  });

  test.each(CASES)(
    'normalizes DeepSeek responses on the configured $api route',
    async (testCase) => {
      mockGetProviderById.mockResolvedValue(
        makeProvider(testCase.endpointType, testCase.baseUrl, testCase.adapterFamily),
      );
      mockGetModelById.mockResolvedValue(
        makeModel(testCase.endpointType, { name: 'DeepSeek V4.1 Flash' }),
      );
      const resolution = await resolve(resolver, {});
      const source = new AssistantMessageEventStream();
      const response: AssistantMessage = {
        role: 'assistant',
        api: testCase.api,
        provider: 'test-provider',
        model: resolution.model.id,
        timestamp: 1,
        stopReason: 'stop',
        content: [
          {
            type: 'text',
            text: '<｜DSML｜tool_calls><｜DSML｜invoke name="lookup"></｜DSML｜invoke></｜DSML｜tool_calls>',
          },
        ],
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      source.push({ type: 'done', reason: 'stop', message: response });
      mockBoundStreamFn.mockReturnValueOnce(source);
      const stream = await resolution.streamFn(resolution.model, { messages: [] });
      expect(await stream.result()).toMatchObject({
        stopReason: 'toolUse',
        content: [
          { type: 'text', text: '' },
          expect.objectContaining({ type: 'toolCall', name: 'lookup', arguments: {} }),
        ],
      });
    },
  );

  test('keeps the independent input cap separate from the default output reservation', async () => {
    const endpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
    const model = makeModel(endpoint, {
      contextWindow: 128_000,
      maxInputTokens: 120_000,
      maxOutputTokens: 32_000,
    });
    mockGetProviderById.mockResolvedValue(
      makeProvider(endpoint, 'https://chat.test/v1', 'openai-compatible'),
    );
    mockGetModelById.mockResolvedValue(model);

    const resolution = await resolve(resolver, { maxOutputTokens: 1024 });

    expect(toPiModelPreflight(model).maxInputTokens).toBe(96_000);
    expect(resolution.maxInputTokens).toBe(120_000);
    expect(resolution.model.contextWindow).toBe(128_000);
    expect(resolution.model.maxTokens).toBe(32_000);
  });

  test.each([{ id: 'perplexity' }, { id: 'copied-perplexity', presetProviderId: 'perplexity' }])(
    'preserves the Perplexity API root for $id',
    async (identity) => {
      const endpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
      mockGetProviderById.mockResolvedValue({
        ...makeProvider(endpoint, 'https://api.perplexity.ai/', 'openai-compatible'),
        ...identity,
      });
      mockGetModelById.mockResolvedValue(makeModel(endpoint));

      const resolution = await resolve(resolver);
      expect(resolution.model.baseUrl).toBe('https://api.perplexity.ai');
    },
  );

  test('uses endpoint usage declarations and preserves the materialized effort vocabulary', async () => {
    const provider = makeProvider(
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      'https://proxy.test/v1',
      'openai-compatible',
    );
    provider.apiFeatures.streamOptions = true;
    provider.endpointConfigs![ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]!.dialect = {
      streamOptions: false,
    };
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(makeModel(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS));

    const resolution = await resolve(resolver, { reasoningEffort: 'auto' });
    expect(resolution.model.compat).toMatchObject({
      supportsUsageInStreaming: false,
      maxTokensField: 'max_tokens',
    });
    const parameters = mockBindPiStream.mock.calls[0][1].requestParameters;
    expect(parameters?.selection).toBe('auto');
    expect(parameters?.model.reasoning?.selectableEfforts).toEqual(['high']);
    expect(parameters?.profile.effort?.operations).toContainEqual({
      target: 'reasoningEffort',
      value: { source: 'effort' },
    });
  });

  test('preflights image input from the model registry without selecting credentials', async () => {
    mockGetProviderById.mockResolvedValue(
      makeProvider(ENDPOINT_TYPE.OPENAI_RESPONSES, 'https://responses.test', 'openai'),
    );
    mockGetModelById.mockResolvedValue(
      makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES, {
        capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION, MODEL_CAPABILITY.FUNCTION_CALL],
      }),
    );

    await expect(
      resolver.preflightModel({ modelId: 'test-model', providerId: 'test-provider' }),
    ).resolves.toMatchObject({
      contextWindow: 128_000,
      inputModalities: ['text', 'image'],
      maxInputTokens: 123_904,
      maxOutputTokens: 4_096,
      supportsTools: true,
    });
    expect(mockResolveApiKey).not.toHaveBeenCalled();
    expect(mockBindPiStream).not.toHaveBeenCalled();
  });

  test('bounds input capacity by both the model limit and reserved output', () => {
    expect(
      toPiModelPreflight(
        makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES, {
          contextWindow: 16_000,
          maxInputTokens: 20_000,
          maxOutputTokens: 4_000,
        }),
      ),
    ).toMatchObject({ contextWindow: 16_000, maxInputTokens: 12_000, maxOutputTokens: 4_000 });
  });

  test('uses the existing per-model gateway route', async () => {
    const provider = makeProvider(
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      'https://aihubmix.test/v1',
      'aihubmix',
    );
    provider.id = 'aihubmix';
    provider.presetProviderId = 'aihubmix';
    provider.endpointConfigs = {
      ...provider.endpointConfigs,
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
        adapterFamily: 'aihubmix',
        baseUrl: 'https://aihubmix.test',
      },
    };
    const model = makeModel(undefined, {
      apiModelId: 'claude-sonnet-4-5',
      endpointTypes: undefined,
      id: 'aihubmix::claude-sonnet-4-5',
      modelId: 'claude-sonnet-4-5',
      providerId: 'aihubmix',
    });
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(model);

    const resolution = await resolver.resolveModel(
      { modelId: 'claude-sonnet-4-5', providerId: 'aihubmix' },
      {},
    );

    expect(resolution.model).toMatchObject({
      api: 'anthropic-messages',
      baseUrl: 'https://aihubmix.test',
    });
  });

  test.each([
    {
      name: 'an unsupported endpoint',
      provider: makeProvider(ENDPOINT_TYPE.OLLAMA_CHAT, 'http://localhost:11434', 'ollama'),
      error: 'does not support the selected endpoint: ollama-chat',
    },
    {
      name: 'a non-standard adapter family',
      provider: makeProvider(
        ENDPOINT_TYPE.OPENAI_RESPONSES,
        'https://azure.test',
        'azure-responses',
      ),
      error: 'does not support provider adapter family: azure-responses',
    },
    {
      name: 'a non-API-key auth type',
      provider: {
        ...makeProvider(ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'https://bedrock.test', 'anthropic'),
        authType: 'iam-aws' as const,
      },
      error: 'does not support provider authentication type: iam-aws',
    },
    {
      name: 'a custom endpoint path',
      provider: makeProvider(
        ENDPOINT_TYPE.OPENAI_RESPONSES,
        'https://responses.test/responses#',
        'openai',
      ),
      error: 'does not support a separate custom endpoint path',
    },
  ])('fails before credential selection for $name', async ({ provider, error }) => {
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(makeModel(provider.defaultChatEndpoint));

    await expect(resolve(resolver)).rejects.toThrow(error);
    expect(mockResolveApiKey).not.toHaveBeenCalled();
    expect(mockBindPiStream).not.toHaveBeenCalled();
  });

  test('rejects a missing API key before binding the provider stream', async () => {
    mockGetProviderById.mockResolvedValue(
      makeProvider(ENDPOINT_TYPE.OPENAI_RESPONSES, 'https://responses.test', 'openai'),
    );
    mockGetModelById.mockResolvedValue(makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES));
    mockResolveApiKey.mockResolvedValue({
      apiKeySelection: { attribution: 'unknown' },
      value: '',
    });

    await expect(resolve(resolver)).rejects.toMatchObject({
      code: 'invalid_api_key',
      message: expect.stringContaining('requires an API key'),
      name: 'PiModelResolutionError',
      retryable: false,
    });
    expect(mockBindPiStream).not.toHaveBeenCalled();
  });
});

function makeProvider(
  endpointType: EndpointType,
  baseUrl: string,
  adapterFamily: string,
): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [],
    authMethods: ['api-key'],
    authType: 'api-key',
    defaultChatEndpoint: endpointType,
    endpointConfigs: { [endpointType]: { adapterFamily, baseUrl } },
    id: 'test-provider',
    isEnabled: true,
    name: 'Test Provider',
    settings: {
      extraHeaders: {
        Authorization: 'Bearer header-secret',
        'X-Custom': 'custom',
      },
    },
  };
}

function makeModel(endpointType: EndpointType | undefined, overrides: Partial<Model> = {}): Model {
  return {
    apiModelId: 'models/test-model',
    capabilities: [MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.REASONING],
    endpointTypes: endpointType ? [endpointType] : undefined,
    id: 'test-provider::test-model',
    isEnabled: true,
    isHidden: false,
    maxOutputTokens: 4096,
    modelId: 'test-model',
    name: 'Test Model',
    providerId: 'test-provider',
    reasoning: { defaultEffort: 'high', selectableEfforts: ['high'] },
    supportsStreaming: true,
    ...overrides,
  };
}

function resolve(
  resolver: PiRuntimeDependencies,
  options: Parameters<PiRuntimeDependencies['resolveModel']>[1] = {},
) {
  return resolver.resolveModel({ modelId: 'test-model', providerId: 'test-provider' }, options);
}
