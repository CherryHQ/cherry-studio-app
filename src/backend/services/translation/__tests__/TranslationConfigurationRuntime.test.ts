import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { modelConfigurationChanges } from '@/backend/data/modelConfigurationChanges';
import type { PreferenceSchema } from '@/shared/data/preference';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import type { NativeTranslationConfiguration } from '../../../../../modules/system-integration';
import { TranslationConfigurationRuntime } from '../TranslationConfigurationRuntime';

const mockNative = {
  getCapabilities: () => ({
    translationWindow: true,
    translationProvider: true,
    translationShortcut: true,
    shortcuts: true,
  }),
  invalidateTranslationConfiguration: jest.fn<Promise<void>, []>(),
  publishTranslationConfiguration: jest.fn<
    Promise<void>,
    [NativeTranslationConfiguration, string]
  >(),
  publishTranslationUnavailable: jest.fn<Promise<void>, [unknown]>(),
  getTranslationRevision: jest.fn<Promise<string | null>, []>(),
};

jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => mockNative,
}));

test('an in-flight publication cannot restore old credentials after the authoritative edit', async () => {
  const publicationStarted = deferred();
  const allowPublication = deferred();
  let nativeRevision: string | null = null;
  let nativeKey: string | null = null;
  let key = 'old-key';
  let paused = false;
  mockNative.invalidateTranslationConfiguration.mockImplementation(async () => {
    nativeRevision = null;
    nativeKey = null;
  });
  mockNative.getTranslationRevision.mockImplementation(async () => nativeRevision);
  mockNative.publishTranslationConfiguration.mockImplementation(async (configuration, secret) => {
    if (!paused) {
      paused = true;
      publicationStarted.resolve();
      await allowPublication.promise;
    }
    nativeRevision = configuration.revision;
    nativeKey = secret;
  });
  const provider: Provider = {
    id: 'provider',
    name: 'Provider',
    isEnabled: true,
    authType: 'api-key',
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [],
    settings: {},
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://example.com' },
    },
  };
  const model: Model = {
    id: createUniqueModelId(provider.id, 'translator'),
    providerId: provider.id,
    modelId: 'translator',
    name: 'Translator',
    isEnabled: true,
    isHidden: false,
    supportsStreaming: true,
    capabilities: [],
  };
  const preferences: Partial<PreferenceSchema> = { 'feature.translate.model_id': model.id };
  const runtime = new TranslationConfigurationRuntime({
    preferences: { getCachedValue: (name) => preferences[name] },
    getModel: async () => model,
    getProvider: async () => provider,
    getKeys: async () => ({ keys: [{ id: 'key', key, isEnabled: true }] }),
    getAuth: async () => null,
    getInterfaceLanguage: () => 'en-US',
    ensureModelCatalog: async () => {},
    resolveNativeConnection: () => ({
      endpoint: 'https://example.com/v1/chat/completions',
      wireModelId: model.modelId,
    }),
  });
  try {
    const starting = runtime.start();
    await publicationStarted.promise;
    let stateAtWrite: { revision: string | null; key: string | null } | undefined;
    const editing = modelConfigurationChanges.write(async () => {
      stateAtWrite = { revision: nativeRevision, key: nativeKey };
      key = 'new-key';
    });
    await Promise.resolve();
    expect(stateAtWrite).toBeUndefined();
    allowPublication.resolve();
    await Promise.all([starting, editing]);
    expect(stateAtWrite).toEqual({ revision: null, key: null });
    expect((await runtime.getAvailability('externalWindow')).status).toBe('ready');
    expect(nativeKey).toBe('new-key');
  } finally {
    allowPublication.resolve();
    await runtime.dispose();
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
