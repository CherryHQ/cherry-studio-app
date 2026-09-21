import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { resolveNativeTranslationConnection } from '../nativeTranslationConnection';

const sampling = { enableTemperature: false, temperature: 1, enableTopP: false, topP: 1 };

function connection(apiModelId: string, reasoningEffort: ReasoningEffortOption = 'none') {
  const provider: Provider = {
    id: 'openai',
    presetProviderId: 'openai',
    name: 'OpenAI',
    isEnabled: true,
    authType: 'api-key',
    apiKeys: [],
    apiFeatures: { ...DEFAULT_API_FEATURES },
    settings: {},
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        adapterFamily: 'openai',
        baseUrl: 'https://api.openai.com',
      },
    },
  };
  const model = {
    ...providerRegistryService.resolveModels(provider.id, [apiModelId], {
      presetProviderId: provider.presetProviderId,
      defaultChatEndpoint: provider.defaultChatEndpoint,
    })[0],
    endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
  };
  const settings = { reasoningEffort, sampling };
  return {
    provider,
    model,
    settings,
    resolve: () => resolveNativeTranslationConnection(provider, model, null, settings),
  };
}

beforeEach(installProviderRegistryTestSnapshot);

test('turns off supported reasoning using the native HTTP field and omits disabled sampling', () => {
  // The catalog id is the wire id for OpenAI itself; only providers with an override rename it.
  expect(connection('gpt-5.4').resolve()).toEqual({
    endpoint: 'https://api.openai.com/v1/chat/completions',
    wireModelId: 'gpt-5-4',
    requestParameters: { reasoning_effort: 'none' },
  });
});

test('does not send an unsupported off selection to a reasoning model', () => {
  expect(connection('gpt-5').resolve()?.requestParameters).toEqual({});
});

test('unsupported automatic reasoning uses the provider default', () => {
  expect(connection('gpt-5.4', 'auto').resolve()?.requestParameters).toEqual({});
});

test('preserves an explicit reasoning level while respecting declared sampling support', () => {
  const input = connection('gpt-5', 'low');
  input.model.parameterSupport = {
    temperature: { supported: false, min: 0, max: 2 },
    topP: { supported: false, min: 0, max: 1 },
    maxTokens: true,
    stopSequences: true,
    systemMessage: true,
  };
  input.settings.sampling = {
    enableTemperature: true,
    temperature: 0.3,
    enableTopP: true,
    topP: 0.8,
  };
  expect(input.resolve()?.requestParameters).toEqual({ reasoning_effort: 'low' });
});

test('projects enabled sampling using HTTP field names for ordinary models', () => {
  const input = connection('gpt-4o-mini');
  input.settings.sampling = {
    enableTemperature: true,
    temperature: 0.3,
    enableTopP: true,
    topP: 0.8,
  };
  expect(input.resolve()?.requestParameters).toEqual({ temperature: 0.3, top_p: 0.8 });
});

test('rejects connections that the standalone native executor cannot represent', () => {
  const input = connection('gpt-4o-mini');
  input.provider.settings.extraHeaders = { 'X-Custom-Auth': 'test' };
  expect(input.resolve()).toBeNull();
});
