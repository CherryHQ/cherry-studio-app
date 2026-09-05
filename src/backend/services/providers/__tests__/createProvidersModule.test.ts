import { ProviderSetupError } from '@/shared/contracts';
import type { ApiKeyEntry, Provider } from '@/shared/data/types/provider';

import { createProvidersModule, type ProvidersModuleDependencies } from '../createProvidersModule';

function subject() {
  let provider = {
    id: 'custom',
    name: 'Custom',
    isEnabled: false,
    authType: 'api-key',
    defaultChatEndpoint: 'openai-chat-completions',
    endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://example.test/v1' } },
  } as Provider;
  const dependencies: ProvidersModuleDependencies = {
    avatars: { persist: jest.fn(), remove: jest.fn(), resolve: jest.fn() },
    catalog: { isExcluded: () => false, list: () => [] },
    hasAvailableModels: jest.fn(async () => true),
    providers: {
      auth: async () => null,
      create: jest.fn(),
      find: jest.fn(),
      list: jest.fn(),
      get: async () => provider,
      keys: jest.fn(
        async (): Promise<ApiKeyEntry[]> => [{ id: 'key', key: 'configured', isEnabled: true }],
      ),
      enable: jest.fn(async () => {
        provider = { ...provider, isEnabled: true };
        return provider;
      }),
    },
    registryUpdates: { apply: jest.fn(), check: jest.fn(), subscribe: jest.fn() },
  };
  return { backend: createProvidersModule(dependencies), dependencies };
}

describe('explicit provider activation', () => {
  it('prepares without enabling, then enables a configured provider with local models', async () => {
    const { backend, dependencies } = subject();
    expect(await backend.getSetupStatus('custom')).toMatchObject({
      issue: null,
      hasModels: true,
      provider: { isEnabled: false },
    });
    expect(dependencies.providers.enable).not.toHaveBeenCalled();
    expect(await backend.enable('custom')).toMatchObject({ isEnabled: true });
    expect(dependencies.providers.enable).toHaveBeenCalledTimes(1);
    await backend.enable('custom');
    expect(dependencies.providers.enable).toHaveBeenCalledTimes(1);
  });

  it('rechecks credentials at completion and keeps the provider disabled', async () => {
    const { backend, dependencies } = subject();
    await backend.getSetupStatus('custom');
    jest.mocked(dependencies.providers.keys).mockResolvedValue([]);
    await expect(backend.enable('custom')).rejects.toEqual(
      new ProviderSetupError('missing-api-key'),
    );
    expect(dependencies.providers.enable).not.toHaveBeenCalled();
  });

  it('requires a usable local model and propagates persistence failures', async () => {
    const { backend, dependencies } = subject();
    jest.mocked(dependencies.hasAvailableModels).mockResolvedValue(false);
    await expect(backend.enable('custom')).rejects.toEqual(new ProviderSetupError('no-models'));
    expect(dependencies.providers.enable).not.toHaveBeenCalled();
    jest.mocked(dependencies.hasAvailableModels).mockResolvedValue(true);
    jest.mocked(dependencies.providers.enable).mockRejectedValue(new Error('storage unavailable'));
    await expect(backend.enable('custom')).rejects.toThrow('storage unavailable');
  });
});
