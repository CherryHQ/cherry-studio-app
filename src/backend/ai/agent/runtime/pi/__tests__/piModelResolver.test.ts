import {
  ENDPOINT_TYPE,
  MODEL_CAPABILITY,
  type EndpointType,
} from '@cherrystudio/provider-registry';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { streamSimple as streamOpenaiCompletions } from '@earendil-works/pi-ai/api/openai-completions';
import { buildBaseOptions } from '@earendil-works/pi-ai/api/simple-options';
import { GITHUB_COPILOT_MODELS } from '@earendil-works/pi-ai/providers/github-copilot.models';
import { KIMI_CODING_MODELS } from '@earendil-works/pi-ai/providers/kimi-coding.models';
import { OPENAI_CODEX_MODELS } from '@earendil-works/pi-ai/providers/openai-codex.models';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { buildRuntimeEndpointConfigs } from '@/backend/data/services/providerRegistryProjection';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import { createTranslationModule } from '@/backend/services/translation';
import { ProviderAccountError } from '@/shared/contracts/providerAccounts';
import type { Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { generatePiText } from '../generatePiText';
import { createPiModelResolver, toPiModelPreflight } from '../piModelResolver';
import type { PiRuntimeDependencies } from '../piModelTypes';
import * as piOAuthModels from '../piOAuthModels';
import { emptyAssistantMessage } from '../piStreamEvents';

type BindPiStream = typeof import('../piApiAdapters').bindPiStream;

const mockGetModelById = jest.fn();
const mockGetProviderById = jest.fn();
const mockGetAuthConfig = jest.fn();
const mockResolveApiKey = jest.fn();
const mockListApiKeys = jest.fn();
const mockBoundStreamFn = jest.fn();
const mockBindPiStream = jest.fn<ReturnType<BindPiStream>, Parameters<BindPiStream>>();

jest.mock('@/backend/data/services/ModelService', () => ({
  modelService: { getById: (...args: unknown[]) => mockGetModelById(...args) },
}));
jest.mock('@/backend/data/services/ProviderService', () => ({
  providerService: {
    getAuthConfig: (...args: unknown[]) => mockGetAuthConfig(...args),
    getByProviderId: (...args: unknown[]) => mockGetProviderById(...args),
    resolveApiKey: (...args: unknown[]) => mockResolveApiKey(...args),
    listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
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
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockBoundStreamFn.mockReset();
    mockGetAuthConfig.mockResolvedValue(null);
    mockListApiKeys.mockResolvedValue({ keys: [] });
    mockResolveApiKey.mockResolvedValue({
      apiKeySelection: CREDENTIAL_RECEIPT,
      value: 'secret-key',
    });
    mockBindPiStream.mockResolvedValue(mockBoundStreamFn);
    resolver = createPiModelResolver();
  });

  test.each([
    {
      endpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      family: 'google-vertex',
      api: 'google-vertex',
      modelId: 'google/gemini-2.5-pro',
      expectedModelId: 'gemini-2.5-pro',
      expectedBaseUrl: 'https://aiplatform.googleapis.com/v1/projects/project-id/locations/global',
    },
    {
      endpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      family: 'google-vertex-anthropic',
      api: 'anthropic-messages',
      modelId: 'anthropic/claude-sonnet-4-5@20250929',
      expectedModelId: 'claude-sonnet-4-5@20250929',
      expectedBaseUrl: 'https://aiplatform.googleapis.com/v1',
    },
  ])(
    'resolves $family tokens per invocation without selecting keys or persisting tokens',
    async ({ endpoint, family, api, modelId, expectedModelId, expectedBaseUrl }) => {
      jest.spyOn(providerRegistryService, 'resolveServerTools').mockReturnValue(['web-search']);
      const provider = makeProvider(endpoint, '', family);
      provider.authType = 'iam-gcp';
      provider.settings.extraHeaders = {
        Authorization: 'wrong-auth',
        'X-Goog-Api-Key': 'wrong-key',
        'X-Custom': 'kept',
      };
      mockGetProviderById.mockResolvedValue(provider);
      mockGetModelById.mockResolvedValue(makeModel(endpoint, { apiModelId: modelId }));
      mockGetAuthConfig.mockResolvedValue({
        type: 'iam-gcp',
        project: 'project-id',
        location: 'global',
        credentials: {
          client_email: 'svc@example.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nYWJjZA==\n-----END PRIVATE KEY-----',
        },
      });
      const getAccessToken = jest
        .fn()
        .mockResolvedValueOnce('token-one')
        .mockResolvedValueOnce('token-two');
      const vertexResolver = createPiModelResolver(undefined, { getAccessToken });
      const first = await resolve(vertexResolver);
      const second = await resolve(vertexResolver);
      expect(mockResolveApiKey).not.toHaveBeenCalled();
      expect(mockListApiKeys).not.toHaveBeenCalled();
      expect(getAccessToken).toHaveBeenCalledTimes(2);
      expect(first.model).toMatchObject({
        api,
        baseUrl: expectedBaseUrl,
        id: expectedModelId,
        headers: { 'X-Custom': 'kept' },
      });
      expect(first.model.headers).not.toHaveProperty('Authorization');
      expect(first.model.headers).not.toHaveProperty('X-Goog-Api-Key');
      expect(JSON.stringify(first.model)).not.toContain('token-one');
      expect(first.usageContext?.credentialReceipt).toEqual({
        attribution: 'auth',
        method: 'iam-gcp',
      });
      expect(first.nativeWebTools).toEqual({
        search: false,
        fetch: false,
        functionToolMixing: false,
      });
      expect(second.redactionValues).toContain('token-two');
      expect(mockBindPiStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ api, supportsCustomFetch: true }),
        expect.objectContaining({
          apiKey: undefined,
          accessToken: 'token-two',
          maxRetries: 0,
          ...(api === 'anthropic-messages'
            ? { vertex: { projectId: 'project-id', location: 'global' } }
            : {}),
        }),
      );
    },
  );

  test('translates with the OpenAI OAuth account and Codex transport when no API key exists', async () => {
    const oauthModel = Object.values(OPENAI_CODEX_MODELS)[0];
    jest.spyOn(piOAuthModels, 'resolveOAuthPiModel').mockResolvedValueOnce(oauthModel);
    const provider = makeProvider(
      ENDPOINT_TYPE.OPENAI_RESPONSES,
      'https://chatgpt.com/backend-api',
      'openai-codex',
    );
    provider.presetProviderId = 'openai-codex';
    provider.authMethods = ['oauth'];
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(
      makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES, { apiModelId: oauthModel.id }),
    );
    mockResolveApiKey.mockRejectedValue(new Error('This provider has no manual API keys.'));
    resolver = createPiModelResolver({
      resolveAuth: async () => ({
        id: 'openai-codex',
        auth: { apiKey: 'oauth-access' },
        availableModelIds: [oauthModel.id],
      }),
    });
    const message = {
      ...emptyAssistantMessage(oauthModel),
      content: [{ type: 'text' as const, text: '你好' }],
    };
    const source = new AssistantMessageEventStream();
    source.push({ type: 'done', reason: 'stop', message });
    mockBoundStreamFn.mockReturnValueOnce(source);
    const translator = createTranslationModule({
      ai: { generateText: (...args) => generatePiText(resolver, ...args) },
      preference: { get: async () => 'test-provider::test-model' },
      models: { getById: mockGetModelById },
    });

    await expect(translator.translate({ text: 'Hello', language: 'zh-CN' })).resolves.toBe('你好');
    expect(mockResolveApiKey).not.toHaveBeenCalled();
    expect(mockBindPiStream).toHaveBeenCalledWith(
      expect.objectContaining({ api: 'openai-codex-responses' }),
      expect.objectContaining({ apiKey: 'oauth-access', temperature: undefined }),
    );
    const [sentModel, context] = mockBoundStreamFn.mock.calls[0];
    expect(sentModel.provider).toBe('openai-codex');
    expect(context.messages).toEqual([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('简体中文') }),
      expect.objectContaining({ role: 'user', content: 'Hello' }),
    ]);
  });

  test('keeps ordinary API-key translation on its configured protocol', async () => {
    mockGetProviderById.mockResolvedValue(
      makeProvider(ENDPOINT_TYPE.OPENAI_RESPONSES, 'https://api.openai.com/v1', 'openai'),
    );
    mockGetModelById.mockResolvedValue(makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES));
    mockBoundStreamFn.mockImplementationOnce((model) => {
      const source = new AssistantMessageEventStream();
      source.push({
        type: 'done',
        reason: 'stop',
        message: {
          ...emptyAssistantMessage(model),
          content: [{ type: 'text', text: '你好' }],
        },
      });
      return source;
    });
    const translator = createTranslationModule({
      ai: { generateText: (...args) => generatePiText(resolver, ...args) },
      preference: { get: async () => 'test-provider::test-model' },
      models: { getById: mockGetModelById },
    });
    await expect(translator.translate({ text: 'Hello', language: 'zh-CN' })).resolves.toBe('你好');
    expect(mockBindPiStream).toHaveBeenCalledWith(
      expect.objectContaining({ api: 'openai-responses' }),
      expect.objectContaining({ apiKey: 'secret-key' }),
    );
  });

  test('retains canonical Copilot identity, model API, and credential-specific base URL', async () => {
    jest
      .spyOn(piOAuthModels, 'resolveOAuthPiModel')
      .mockResolvedValueOnce(GITHUB_COPILOT_MODELS['claude-sonnet-4.6']);
    const provider = makeProvider(
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      'https://api.githubcopilot.com',
      'github-copilot-openai-compatible',
    );
    provider.presetProviderId = 'copilot';
    provider.authMethods = ['oauth'];
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(
      makeModel(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, { apiModelId: 'claude-sonnet-4.6' }),
    );
    resolver = createPiModelResolver({
      resolveAuth: async () => ({
        id: 'github-copilot',
        auth: { apiKey: 'copilot-access', baseUrl: 'https://api.business.githubcopilot.com' },
        availableModelIds: ['claude-sonnet-4.6'],
      }),
    });
    const resolution = await resolve(resolver);
    expect(piOAuthModels.resolveOAuthPiModel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'github-copilot' }),
      'claude-sonnet-4.6',
    );
    expect(resolution.model).toMatchObject({
      provider: 'github-copilot',
      api: 'anthropic-messages',
      baseUrl: 'https://api.business.githubcopilot.com',
    });
    expect(resolution.usageContext).toMatchObject({
      providerId: 'test-provider',
      credentialReceipt: { attribution: 'unknown' },
    });
    expect(mockResolveApiKey).not.toHaveBeenCalled();
  });

  test.each([
    {
      endpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      baseUrl: 'https://api.kimi.com/coding',
      family: 'anthropic',
    },
    {
      endpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      baseUrl: 'https://api.kimi.com/coding/v1',
      family: 'openai-compatible',
    },
  ])(
    'uses the official Kimi protocol and authentication for saved $endpoint settings',
    async ({ endpoint, baseUrl, family }) => {
      jest
        .spyOn(piOAuthModels, 'resolveOAuthPiModel')
        .mockResolvedValueOnce(KIMI_CODING_MODELS['kimi-for-coding']);
      const provider = makeProvider(endpoint, baseUrl, family);
      provider.presetProviderId = 'kimi-coding';
      provider.authMethods = ['oauth'];
      mockGetProviderById.mockResolvedValue(provider);
      mockGetModelById.mockResolvedValue(makeModel(endpoint, { apiModelId: 'kimi-for-coding' }));
      resolver = createPiModelResolver({
        resolveAuth: async () => ({
          id: 'kimi-coding',
          auth: { headers: { Authorization: 'Bearer kimi-access' } },
          availableModelIds: undefined,
        }),
      });
      const resolution = await resolve(resolver);
      expect(piOAuthModels.resolveOAuthPiModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'kimi-coding' }),
        'kimi-for-coding',
      );
      expect(mockBindPiStream).toHaveBeenCalledWith(
        expect.objectContaining({ api: 'openai-completions' }),
        expect.objectContaining({
          apiKey: undefined,
          headers: expect.objectContaining({ Authorization: 'Bearer kimi-access' }),
        }),
      );
      expect(resolution.model).toMatchObject({
        provider: 'kimi-coding',
        api: 'openai-completions',
        baseUrl: 'https://api.kimi.com/coding/v1',
        compat: {
          requiresReasoningContentOnAssistantMessages: true,
          supportsMidConvoSystemMessages: true,
          supportsMidConvoToolAdditions: true,
        },
      });
      expect(resolution.redactionValues).toContain('kimi-access');
      expect(mockResolveApiKey).not.toHaveBeenCalled();
    },
  );

  test('never falls back to manual API keys after a stored OAuth refresh fails', async () => {
    mockGetProviderById.mockResolvedValue(
      makeProvider(ENDPOINT_TYPE.OPENAI_RESPONSES, 'https://api.x.ai/v1', 'xai-responses'),
    );
    mockGetModelById.mockResolvedValue(makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES));
    resolver = createPiModelResolver({
      resolveAuth: async () => {
        throw new ProviderAccountError('authorization');
      },
    });
    await expect(resolve(resolver)).rejects.toEqual(new ProviderAccountError('authorization'));
    expect(mockResolveApiKey).not.toHaveBeenCalled();
  });

  test.each([
    { baseUrl: 'https://openrouter.ai/api', preset: undefined, enabled: true },
    { baseUrl: 'https://relay.example', preset: 'openrouter', enabled: false },
  ])(
    'enables explicit OpenRouter compatibility for custom provider ids: %p',
    async ({ baseUrl, preset, enabled }) => {
      const provider = makeProvider(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, baseUrl, 'openai');
      provider.presetProviderId = preset;
      provider.settings.cacheControl = { enabled };
      mockGetProviderById.mockResolvedValue(provider);
      mockGetModelById.mockResolvedValue(
        makeModel(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, {
          apiModelId: 'anthropic/claude-sonnet-4.6',
        }),
      );
      const resolution = await resolve(resolver);
      expect(resolution.model).toMatchObject({
        provider: 'test-provider',
        compat: {
          cacheControlFormat: 'anthropic',
          sendSessionAffinityHeaders: true,
          sessionAffinityFormat: 'openrouter',
        },
      });
      expect(mockBindPiStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sessionId: 'session-1',
          cacheRetention: enabled ? 'short' : 'none',
        }),
      );
    },
  );

  test('does not infer Anthropic cache support from a Claude model name on an unknown relay', async () => {
    mockGetProviderById.mockResolvedValue(
      makeProvider(
        ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        'https://openrouter.ai.untrusted.example/api',
        'openai',
      ),
    );
    mockGetModelById.mockResolvedValue(
      makeModel(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, {
        apiModelId: 'anthropic/claude-sonnet-4.6',
      }),
    );
    const resolution = await resolve(resolver);
    expect(resolution.model.compat).not.toHaveProperty('cacheControlFormat');
    expect(resolution.model.compat).not.toHaveProperty('sendSessionAffinityHeaders');
  });

  test.each([undefined, true, false])(
    'applies native Anthropic cache setting %p',
    async (enabled) => {
      const provider = makeProvider(
        ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
        'https://api.anthropic.com',
        'anthropic',
      );
      if (enabled !== undefined) provider.settings.cacheControl = { enabled };
      mockGetProviderById.mockResolvedValue(provider);
      mockGetModelById.mockResolvedValue(makeModel(ENDPOINT_TYPE.ANTHROPIC_MESSAGES));
      await resolve(resolver);
      expect(mockBindPiStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          cacheRetention: enabled === false ? 'none' : 'short',
          sessionId: 'session-1',
        }),
      );
    },
  );

  test('uses the selected probe key for transport, attribution, and redaction', async () => {
    const testCase = CASES[0];
    const provider = makeProvider(testCase.endpointType, testCase.baseUrl, testCase.adapterFamily);
    provider.apiKeys = [
      { id: 'key-1', isEnabled: true },
      { id: 'key-2', isEnabled: true },
    ];
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(makeModel(testCase.endpointType));
    mockResolveApiKey.mockResolvedValue({
      apiKeySelection: CREDENTIAL_RECEIPT,
      value: 'probe-key',
    });
    const resolution = await resolver.resolveModel(
      { modelId: 'test-model', providerId: 'test-provider' },
      {},
      'probe-session',
      'probe-key',
    );
    expect(mockResolveApiKey).toHaveBeenCalledWith('test-provider', 'probe-key');
    expect(mockBindPiStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: 'probe-key' }),
    );
    expect(resolution.redactionValues).toContain('probe-key');
    expect(resolution.usageContext.credentialReceipt).toEqual(CREDENTIAL_RECEIPT);
    expect(mockListApiKeys).not.toHaveBeenCalled();
  });

  test('walks enabled keys as a ring and attributes each call to the serving key', async () => {
    const testCase = CASES[0];
    const keys = ['a', 'b', 'c'].map((id) => ({
      id,
      isEnabled: true,
      key: `secret-${id}`,
      label: `Account ${id}`,
    }));
    const provider = makeProvider(testCase.endpointType, testCase.baseUrl, testCase.adapterFamily);
    provider.apiKeys = [...keys, { id: 'disabled', isEnabled: false }];
    provider.settings.extraHeaders = {
      ...provider.settings.extraHeaders,
      'CF-AIG-Authorization': 'Bearer gateway-key',
    };
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(makeModel(testCase.endpointType));
    mockListApiKeys.mockResolvedValue({ keys });
    mockResolveApiKey.mockImplementation(async (_providerId, override) => {
      const key = keys.find((entry) => entry.key === (override ?? 'secret-b'))!;
      return {
        value: key.key,
        apiKeySelection: {
          attribution: override ? 'matched' : 'explicit',
          id: key.id,
          label: key.label,
          masked: '****',
        },
      };
    });
    const usedKeys: string[] = [];
    const statuses: Record<string, number[]> = {
      'secret-a': [200, 200, 503],
      'secret-b': [401, 200],
      'secret-c': [429],
    };
    mockBindPiStream.mockImplementation(async (_adapter, binding) => () => {
      const { apiKey } = binding;
      if (!apiKey) throw new Error('Expected an API key for credential rotation.');
      usedKeys.push(apiKey);
      const status = statuses[apiKey].shift()!;
      const response: AssistantMessage = {
        role: 'assistant',
        api: testCase.api,
        provider: provider.id,
        model: 'test-model',
        content: status === 200 ? [{ type: 'text', text: 'ok' }] : [],
        stopReason: status === 200 ? 'stop' : 'error',
        timestamp: 1,
        diagnostics: [{ type: 'provider_response_failure', timestamp: 1, details: { status } }],
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const stream = new AssistantMessageEventStream();
      stream.push(
        status === 200
          ? { type: 'done', reason: 'stop', message: response }
          : { type: 'error', reason: 'error', error: response },
      );
      stream.end();
      return stream;
    });

    const resolution = await resolve(resolver);
    expect(resolution.redactionValues).toEqual(
      expect.arrayContaining(['secret-a', 'secret-b', 'secret-c']),
    );
    for (const [servingKey, attribution] of [
      ['a', 'matched'],
      ['a', 'matched'],
      ['b', 'explicit'],
    ]) {
      const stream = await resolution.streamFn(
        resolution.model,
        normalizeContext({ messages: [] }),
      );
      expect((await stream.result()).content).toEqual([{ type: 'text', text: 'ok' }]);
      expect(resolution.usageContext.credentialReceipt).toMatchObject({
        attribution,
        id: servingKey,
        label: `Account ${servingKey}`,
      });
    }
    expect(usedKeys).toEqual([
      'secret-b',
      'secret-c',
      'secret-a',
      'secret-a',
      'secret-a',
      'secret-b',
    ]);
    expect(mockListApiKeys).toHaveBeenCalledWith(provider.id, { enabled: true });
  });

  test('bounds all credential attempts to thirty minutes before output', async () => {
    jest.useFakeTimers();
    try {
      const testCase = CASES[0];
      const keys = ['key-1', 'key-2', 'key-3'].map((id) => ({
        id,
        isEnabled: true,
        key: `secret-${id}`,
      }));
      const provider = makeProvider(
        testCase.endpointType,
        testCase.baseUrl,
        testCase.adapterFamily,
      );
      provider.apiKeys = keys;
      mockGetProviderById.mockResolvedValue(provider);
      mockGetModelById.mockResolvedValue(makeModel(testCase.endpointType));
      mockListApiKeys.mockResolvedValue({ keys });
      mockResolveApiKey.mockImplementation(async (_providerId, override) => ({
        value: override ?? keys[0].key,
        apiKeySelection: {
          ...CREDENTIAL_RECEIPT,
          id: keys.find((key) => key.key === (override ?? keys[0].key))!.id,
        },
      }));
      const usedKeys: string[] = [];
      let signal: AbortSignal | undefined;
      mockBindPiStream.mockImplementation(
        async (_adapter, binding) => (_model, _context, options) => {
          const { apiKey } = binding;
          if (!apiKey) throw new Error('Expected an API key for credential retries.');
          usedKeys.push(apiKey);
          signal = options?.signal;
          if (apiKey === keys[0].key) {
            return new Promise<AssistantMessageEventStream>((_resolve, reject) => {
              setTimeout(() => reject(new Error('Temporary failure')), 60_000);
            });
          }
          return new AssistantMessageEventStream();
        },
      );

      const resolution = await resolve(resolver);
      const stream = await resolution.streamFn(
        resolution.model,
        normalizeContext({ messages: [] }),
      );
      await jest.advanceTimersByTimeAsync(30 * 60_000);

      expect(await stream.result()).toMatchObject({
        stopReason: 'error',
        errorMessage: 'The model response timed out after 1800 seconds without data.',
      });
      expect(usedKeys).toEqual([keys[0].key, keys[1].key]);
      expect(signal?.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    ...CASES.map((testCase) => ({
      ...testCase,
      authHeader: 'aUtHoRiZaTiOn',
      value: 'Bearer header-secret',
    })),
    { ...CASES[0], authHeader: 'Authorization', value: '' },
    { ...CASES[2], authHeader: 'X-Api-Key', value: 'header-secret' },
    { ...CASES[3], authHeader: 'X-Goog-Api-Key', value: 'header-secret' },
    ...['API-Key', 'Authorization'].map((authHeader) => ({
      ...CASES[0],
      adapterFamily: 'azure-responses',
      api: 'azure-openai-responses',
      authHeader,
      value: 'header-secret',
    })),
  ])(
    'preserves $authHeader on $api without rotating or attributing the overridden key',
    async (testCase) => {
      const provider = makeProvider(
        testCase.endpointType,
        testCase.baseUrl,
        testCase.adapterFamily,
      );
      provider.apiKeys = [
        { id: 'key-1', isEnabled: true },
        { id: 'key-2', isEnabled: true },
      ];
      provider.settings.extraHeaders = { [testCase.authHeader]: testCase.value };
      if (testCase.adapterFamily === 'azure-responses') provider.authType = 'iam-azure';
      mockGetProviderById.mockResolvedValue(provider);
      mockGetModelById.mockResolvedValue(makeModel(testCase.endpointType));
      mockListApiKeys.mockResolvedValue({
        keys: provider.apiKeys.map((key) => ({ ...key, key: `secret-${key.id}` })),
      });

      const resolution = await resolve(resolver);
      expect(resolution.usageContext.credentialReceipt).toEqual({ attribution: 'unknown' });
      expect(resolution.redactionValues).toEqual(['secret-key', testCase.value]);
      expect(mockBindPiStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({ [testCase.authHeader]: testCase.value }),
        }),
      );

      for (const status of [401, 429]) {
        const failure: AssistantMessage = {
          role: 'assistant',
          api: resolution.model.api,
          provider: provider.id,
          model: resolution.model.id,
          content: [],
          stopReason: 'error',
          timestamp: 1,
          diagnostics: [{ type: 'provider_response_failure', timestamp: 1, details: { status } }],
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        };
        mockBoundStreamFn.mockImplementation(() => {
          const stream = new AssistantMessageEventStream();
          stream.push({ type: 'error', reason: 'error', error: failure });
          return stream;
        });
        const stream = await resolution.streamFn(
          resolution.model,
          normalizeContext({ messages: [] }),
        );
        expect(await stream.result()).toBe(failure);
      }
      expect(mockBoundStreamFn).toHaveBeenCalledTimes(2);
      expect(mockListApiKeys).not.toHaveBeenCalled();
      expect(mockResolveApiKey).toHaveBeenCalledTimes(1);
    },
  );

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
    expect(resolution.model.headers).not.toHaveProperty('x-opencode-session');
    expect(resolution.supportsTools).toBe(true);
    expect(resolution.defaultThinkingLevel).toBe('high');
    expect(resolution.redactionValues).toEqual(['secret-key']);
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
          'X-App-Name': 'CherryStudioMobile',
          'X-Custom': 'custom',
        }),
        maxRetries: 0,
        maxTokens: 1024,
        temperature: 0.25,
      }),
    );
  });

  test('resolves Azure Responses and forwards the Azure API version', async () => {
    const provider = makeProvider(
      ENDPOINT_TYPE.OPENAI_RESPONSES,
      'https://resource.openai.azure.com/openai',
      'azure-responses',
    );
    provider.authMethods = undefined;
    provider.authType = 'iam-azure';
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES));
    mockGetAuthConfig.mockResolvedValue({ type: 'iam-azure', apiVersion: '2025-04-01-preview' });

    const resolution = await resolve(resolver, { maxOutputTokens: 1024 });

    expect(resolution.model).toMatchObject({
      api: 'azure-openai-responses',
      baseUrl: 'https://resource.openai.azure.com/openai',
    });
    expect(mockGetAuthConfig).toHaveBeenCalledWith('test-provider');
    expect(mockBindPiStream).toHaveBeenCalledWith(
      expect.objectContaining({ api: 'azure-openai-responses' }),
      expect.objectContaining({ azureApiVersion: '2025-04-01-preview' }),
    );
  });

  test.each(CASES.filter((testCase) => testCase.adapterFamily !== 'google'))(
    'adds the OpenCode session header to the $api model and transport',
    async (testCase) => {
      for (const id of ['opencode', 'opencode-copy']) {
        const provider = {
          ...makeProvider(testCase.endpointType, testCase.baseUrl, testCase.adapterFamily),
          id,
          presetProviderId: id === 'opencode-copy' ? 'opencode' : undefined,
        };
        mockGetProviderById.mockResolvedValue(provider);
        mockGetModelById.mockResolvedValue(makeModel(testCase.endpointType, { providerId: id }));

        for (const sessionId of ['session-1', 'session-2']) {
          const resolution = await resolver.resolveModel(
            { modelId: 'test-model', providerId: id },
            {},
            sessionId,
          );

          expect(resolution.model.headers).toMatchObject({
            'x-opencode-session': sessionId,
            'X-Custom': 'custom',
          });
          expect(mockBindPiStream).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ headers: resolution.model.headers }),
          );
        }
        expect(provider.settings.extraHeaders).not.toHaveProperty('x-opencode-session');
      }
    },
  );

  test('preserves an explicit OpenCode session header regardless of casing', async () => {
    const provider = makeProvider(
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      'https://opencode.ai/zen/go/v1',
      'openai-compatible',
    );
    provider.presetProviderId = 'opencode';
    provider.settings.extraHeaders = { 'X-OpenCode-Session': 'configured-session' };
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(makeModel(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS));

    const resolution = await resolve(resolver);

    expect(resolution.model.headers).toMatchObject({ 'X-OpenCode-Session': 'configured-session' });
    expect(resolution.model.headers).not.toHaveProperty('x-opencode-session');
    expect(mockBindPiStream).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ headers: resolution.model.headers }),
    );
  });

  test.each([
    [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'openai-completions', 'https://opencode.ai/zen/go/v1'],
    [ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai-responses', 'https://opencode.ai/zen/go/v1'],
    [ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'anthropic-messages', 'https://opencode.ai/zen/go'],
  ] as const)(
    'keeps OpenCode Go conversations on the bundled %s route',
    async (endpointType, api, baseUrl) => {
      const preset = providerRegistryService.loadProviders().find(({ id }) => id === 'opencode');
      if (!preset) throw new Error('Missing OpenCode provider preset');
      const provider = {
        ...makeProvider(endpointType, baseUrl, ''),
        id: 'opencode',
        presetProviderId: 'opencode',
        endpointConfigs: buildRuntimeEndpointConfigs(preset.endpointConfigs),
      };
      mockGetProviderById.mockResolvedValue(provider);
      mockGetModelById.mockResolvedValue(makeModel(endpointType, { providerId: provider.id }));

      const resolution = await resolver.resolveModel(
        { modelId: 'test-model', providerId: provider.id },
        {},
        'conversation-session',
      );

      expect(resolution.model).toMatchObject({
        api,
        baseUrl,
        headers: {
          'User-Agent': 'CherryStudioMobile/1.0',
          'x-opencode-session': 'conversation-session',
        },
      });
      expect(mockBindPiStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ api }),
        expect.objectContaining({
          apiKey: 'secret-key',
          headers: resolution.model.headers,
        }),
      );
    },
  );

  test.each([ENDPOINT_TYPE.OPENAI_RESPONSES, ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS])(
    'keeps system updates inline only for official DeepSeek %s endpoints',
    async (endpoint) => {
      mockGetModelById.mockResolvedValue(makeModel(endpoint, { name: 'DeepSeek Flash' }));
      for (const baseUrl of ['https://api.deepseek.com/v1', 'https://relay.example.test/v1']) {
        mockGetProviderById.mockResolvedValue(makeProvider(endpoint, baseUrl, 'openai-compatible'));
        const resolution = await resolve(resolver, {});
        if (baseUrl === 'https://api.deepseek.com/v1') {
          expect(resolution.model.compat).toMatchObject({ supportsMidConvoSystemMessages: true });
        } else {
          expect(resolution.model.compat).not.toHaveProperty('supportsMidConvoSystemMessages');
        }
      }
    },
  );

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
      const stream = await resolution.streamFn(
        resolution.model,
        normalizeContext({ messages: [] }),
      );
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

    expect(toPiModelPreflight(model).maxInputTokens).toBe(120_000);
    expect(resolution.maxInputTokens).toBe(120_000);
    expect(resolution.model.contextWindow).toBe(128_000);
    expect(resolution.model.maxTokens).toBe(32_000);
  });

  test.each([
    [1_048_576, 1_048_576, undefined, 65_536],
    [1_048_576, 1_048_576, 131_072, 131_072],
    [64_000, 1_048_576, undefined, 64_000],
    [32_000, 128_000, undefined, 32_000],
  ])(
    'serializes pinned SDK output reservation %i/%i with explicit %s',
    async (ceiling, window, explicit, expected) => {
      const endpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
      mockGetProviderById.mockResolvedValue(
        makeProvider(endpoint, 'https://openrouter.ai/api/v1', 'openai-compatible'),
      );
      mockGetModelById.mockResolvedValue(
        makeModel(endpoint, {
          apiModelId: 'gemini-4-argon',
          contextWindow: window,
          maxOutputTokens: ceiling,
        }),
      );
      const resolution = await resolve(resolver, { maxOutputTokens: explicit });
      const binding = mockBindPiStream.mock.calls.at(-1)![1];
      const model = {
        ...resolution.model,
        api: 'openai-completions' as const,
        reasoning: false,
        compat: { maxTokensField: 'max_tokens' as const },
      };
      const context = normalizeContext({
        messages: [
          {
            role: 'user' as const,
            content: ceiling >= window ? 'x'.repeat(397_190) : 'Hello',
            timestamp: 1,
          },
        ],
      });
      const capture = async (maxTokens: number | undefined) => {
        let body = '';
        const result = await streamOpenaiCompletions(model, context, {
          apiKey: 'fixture',
          maxTokens,
          maxRetries: 0,
          fetch: async (_url, init) => {
            body = String(init?.body);
            const event = {
              id: 'fixture',
              object: 'chat.completion.chunk',
              created: 1,
              model: model.id,
              choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: 'stop' }],
            };
            return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, {
              headers: { 'content-type': 'text/event-stream' },
            });
          },
        }).result();
        expect(result.stopReason).toBe('stop');
        return body;
      };
      const body = await capture(binding.maxTokens);
      expect(JSON.parse(body)).toHaveProperty('max_tokens', expected);
      expect(resolution.model.maxTokens).toBe(ceiling);
      if (ceiling < window) {
        // The old resolver supplied the capability directly; compare the entire serialized request.
        expect(body).toBe(await capture(ceiling));
      }
    },
  );

  test('preserves input capacity and the output capability when both span the full context', async () => {
    const endpoint = ENDPOINT_TYPE.OPENAI_RESPONSES;
    const model = makeModel(endpoint, {
      apiModelId: 'grok-4.5',
      contextWindow: 500_000,
      maxOutputTokens: 500_000,
    });
    mockGetProviderById.mockResolvedValue(
      makeProvider(endpoint, 'https://api.x.ai/v1', 'xai-responses'),
    );
    mockGetModelById.mockResolvedValue(model);

    const preflight = await resolver.preflightModel({
      providerId: 'test-provider',
      modelId: model.modelId,
    });
    const resolution = await resolve(resolver);

    expect(preflight).toMatchObject({
      contextWindow: 500_000,
      maxInputTokens: 500_000,
      maxOutputTokens: 500_000,
    });
    expect(resolution.model.maxTokens).toBe(500_000);
    expect(mockBindPiStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxTokens: 65_536 }),
    );
    const binding = mockBindPiStream.mock.calls.at(-1)![1];
    const shortRequest = buildBaseOptions(
      resolution.model,
      normalizeContext({
        messages: [{ role: 'user', content: '测试', timestamp: 1 }],
      }),
      { maxTokens: binding.maxTokens },
    );
    const longerRequest = buildBaseOptions(
      resolution.model,
      normalizeContext({
        messages: [{ role: 'user', content: 'x'.repeat(100_000), timestamp: 1 }],
      }),
      { maxTokens: binding.maxTokens },
    );
    expect(shortRequest.maxTokens).toBe(65_536);
    expect(longerRequest.maxTokens).toBe(65_536);
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
      maxInputTokens: 128_000,
      maxOutputTokens: 4_096,
      supportsTools: true,
    });
    expect(mockResolveApiKey).not.toHaveBeenCalled();
    expect(mockBindPiStream).not.toHaveBeenCalled();
  });

  test.each([
    ['openai', ENDPOINT_TYPE.OPENAI_RESPONSES, true],
    [null, ENDPOINT_TYPE.OPENAI_RESPONSES, false],
    ['openai', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, false],
  ] as const)(
    'gates native search by trusted identity %s and actual endpoint %s',
    async (presetProviderId, endpoint, search) => {
      mockGetProviderById.mockResolvedValue({
        ...makeProvider(endpoint, 'https://copied.test', 'openai'),
        presetProviderId,
      });
      mockGetModelById.mockResolvedValue(
        makeModel(endpoint, { apiModelId: 'gpt-4.1', modelId: 'gpt-4.1' }),
      );
      expect((await resolve(resolver)).nativeWebTools).toMatchObject({ search, fetch: false });
    },
  );

  test('answers native web support for a configuration without selecting a key', async () => {
    const endpoint = ENDPOINT_TYPE.OPENAI_RESPONSES;
    mockGetProviderById.mockResolvedValue({
      ...makeProvider(endpoint, 'https://openai.test', 'openai'),
      presetProviderId: 'openai',
    });
    mockGetModelById.mockResolvedValue(
      makeModel(endpoint, { apiModelId: 'gpt-5', modelId: 'gpt-5' }),
    );
    const model = { modelId: 'test-model', providerId: 'test-provider' };
    mockResolveApiKey.mockClear();
    expect(await resolver.nativeWebTools?.(model, {})).toEqual({
      search: true,
      fetch: false,
      functionToolMixing: true,
      dialect: 'openai-responses',
    });
    expect((await resolver.nativeWebTools?.(model, { reasoningEffort: 'minimal' }))?.search).toBe(
      false,
    );
    expect(mockResolveApiKey).not.toHaveBeenCalled();
  });

  test.each([
    ['gemini-3-flash-preview', true],
    ['gemini-2.5-flash', false],
  ])('mixes Gemini native tools with functions only from Gemini 3: %s', async (id, mixing) => {
    const endpoint = ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT;
    mockGetProviderById.mockResolvedValue({
      ...makeProvider(endpoint, 'https://gemini.test', 'gemini'),
      presetProviderId: 'gemini',
    });
    mockGetModelById.mockResolvedValue(makeModel(endpoint, { apiModelId: id, modelId: id }));
    expect((await resolve(resolver)).nativeWebTools).toEqual({
      search: true,
      fetch: true,
      functionToolMixing: mixing,
      dialect: 'google',
    });
  });

  test.each([
    ['anthropic', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'claude-sonnet-4-5', 'anthropic', true],
    ['openai', ENDPOINT_TYPE.OPENAI_RESPONSES, 'gpt-6.1-terra', 'openai-responses', false],
    ['deepseek', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'deepseek-v4-pro', 'anthropic', false],
    // DeepSeek ignores the tool on Responses, so that endpoint keeps the external service.
    ['deepseek', ENDPOINT_TYPE.OPENAI_RESPONSES, 'deepseek-v4-pro', undefined, false],
    ['grok', ENDPOINT_TYPE.OPENAI_RESPONSES, 'grok-4-1-fast', 'xai', false],
    ['poe', ENDPOINT_TYPE.OPENAI_RESPONSES, 'gpt-5', 'openai-preview', false],
    ['doubao', ENDPOINT_TYPE.OPENAI_RESPONSES, 'doubao-seed-2-0-pro', 'openai-responses', false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_RESPONSES, 'qwen3-max', 'openai-responses', false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_RESPONSES, 'qwen-plus', undefined, false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'qwen-plus', 'dashscope', false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'glm-5-2', undefined, false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'kimi-k3', undefined, false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_RESPONSES, 'glm-5.2', 'openai-responses', false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_RESPONSES, 'kimi-k3', 'openai-responses', false],
    ['dashscope', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'qwen3.8-flash', 'qwen-anthropic', true],
    ['dashscope', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'qwen-plus', undefined, false],
    ['dashscope', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'deepseek-v4-flash', undefined, false],
    [
      'dashscope',
      ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      'deepseek-v4-flash-0731',
      'qwen-anthropic',
      true,
    ],
    ['qwencloud', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'qwen3.8-flash', 'qwencloud', false],
    ['qwencloud', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'qwen3.8-max-preview', undefined, false],
    ['qwencloud', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'glm-5.2', undefined, false],
    ['qwencloud', ENDPOINT_TYPE.OPENAI_RESPONSES, 'glm-5.2', 'openai-responses', false],
    ['qwencloud', ENDPOINT_TYPE.OPENAI_RESPONSES, 'qwen3.8-flash', undefined, false],
    ['qwencloud', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'qwen3.8-max', 'qwen-anthropic', true],
    ['qwencloud', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'qwen3.8-flash', undefined, false],
    ['qwencloud', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'deepseek-v4.1-flash', undefined, false],
    [
      'qwencloud',
      ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      'deepseek-v4.1-flash-1017',
      'qwen-anthropic',
      true,
    ],
    ['dashscope', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'glm-5-3', undefined, false],
    ['dashscope', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'kimi-k2-5', undefined, false],
    ['zhipu', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'glm-5-2', 'zhipu', false],
    ['openrouter', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'vendor/any-model', 'openrouter', false],
    ['perplexity', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'sonar-pro', 'perplexity', false],
    [
      'cherryin',
      ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      'anthropic/claude-sonnet-4.5',
      'anthropic',
      true,
    ],
    ['cherryin', ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai/gpt-5', 'openai-responses', false],
    // A host's Chat Completions endpoint has no native tool to pass through.
    ['cherryin', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'openai/gpt-5', undefined, false],
  ] as const)(
    'serves %s over %s for %s through the %s adapter',
    async (presetProviderId, endpoint, id, dialect, fetch) => {
      mockGetProviderById.mockResolvedValue({
        ...makeProvider(endpoint, 'https://host.test', 'openai'),
        presetProviderId,
      });
      mockGetModelById.mockResolvedValue(makeModel(endpoint, { apiModelId: id, modelId: id }));
      expect((await resolve(resolver)).nativeWebTools).toMatchObject(
        dialect ? { search: true, fetch, dialect } : { search: false, fetch: false },
      );
    },
  );

  test('does not enable native search for minimal reasoning', async () => {
    const endpoint = ENDPOINT_TYPE.OPENAI_RESPONSES;
    mockGetProviderById.mockResolvedValue({
      ...makeProvider(endpoint, 'https://openai.test', 'openai'),
      presetProviderId: 'openai',
    });
    mockGetModelById.mockResolvedValue(
      makeModel(endpoint, { apiModelId: 'gpt-5', modelId: 'gpt-5' }),
    );
    expect((await resolve(resolver, { reasoningEffort: 'minimal' })).nativeWebTools?.search).toBe(
      false,
    );
  });

  test('bounds the independent input limit by the total context window', () => {
    expect(
      toPiModelPreflight(
        makeModel(ENDPOINT_TYPE.OPENAI_RESPONSES, {
          contextWindow: 16_000,
          maxInputTokens: 20_000,
          maxOutputTokens: 4_000,
        }),
      ),
    ).toMatchObject({ contextWindow: 16_000, maxInputTokens: 16_000, maxOutputTokens: 4_000 });
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
      'session-1',
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

  test.each(CASES)('resolves a keyless gateway using $endpointType', async (testCase) => {
    const provider = makeProvider(testCase.endpointType, testCase.baseUrl, testCase.adapterFamily);
    provider.authOptional = true;
    mockGetProviderById.mockResolvedValue(provider);
    mockGetModelById.mockResolvedValue(makeModel(testCase.endpointType));
    mockResolveApiKey.mockResolvedValue({
      apiKeySelection: { attribution: 'unknown' },
      value: '',
    });

    const resolution = await resolve(resolver);

    expect(resolution.model).toMatchObject({ api: testCase.api });
    expect(resolution.usageContext.credentialReceipt).toEqual({ attribution: 'unknown' });
    expect(resolution.redactionValues).not.toContain('unused');
    expect(mockBindPiStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: '' }),
    );
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
  return resolver.resolveModel(
    { modelId: 'test-model', providerId: 'test-provider' },
    options,
    'session-1',
  );
}
