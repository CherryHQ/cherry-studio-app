import type { ProvidersBackend } from '@/shared/contracts';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { ProvidersService, type ProvidersServiceDependencies } from '../ProvidersService';

const provider = { id: 'cherryin', isEnabled: false } as Provider;

function createSubject() {
  const dependencies: ProvidersServiceDependencies = {
    avatars: {
      persist: jest.fn(async () => 'file:///avatar'),
      resolve: jest.fn(() => 'file:///avatar'),
    },
    providers: {
      canRemove: jest.fn(() => true),
      create: jest.fn(async () => provider),
      get: jest.fn(async () => provider),
      getAuth: jest.fn(async () => ({
        accessToken: 'token',
        clientId: 'client',
        type: 'oauth' as const,
      })),
      list: jest.fn(async () => [provider]),
      listApiKeys: jest.fn(async () => []),
      remove: jest.fn(async () => undefined),
      replaceApiKeys: jest.fn(async () => provider),
      update: jest.fn(async () => provider),
      updateApiKey: jest.fn(async () => provider),
    },
  };
  const backend: ProvidersBackend = new ProvidersService(dependencies);
  return { backend, dependencies };
}

describe('ProvidersService', () => {
  it('delegates provider removal policy to its repository port', () => {
    const { backend, dependencies } = createSubject();

    expect(backend.canRemove(provider)).toBe(true);
    expect(dependencies.providers.canRemove).toHaveBeenCalledWith(provider);
  });

  it('delegates avatar storage to its avatar port', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.persistAvatar('cherryin', 'file:///source')).resolves.toBe(
      'file:///avatar',
    );
    expect(dependencies.avatars.persist).toHaveBeenCalledWith('cherryin', 'file:///source');

    expect(backend.resolveAvatar('cherryin')).toBe('file:///avatar');
    expect(dependencies.avatars.resolve).toHaveBeenCalledWith('cherryin');
  });
});
