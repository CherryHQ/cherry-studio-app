import type { Provider } from '@cherrystudio/universal/data/types/provider';

import type { ProvidersModule } from '@/shared/contracts';

import { createProvidersModule, type ProvidersModuleDependencies } from '../createProvidersModule';

const provider = { id: 'cherryin', isEnabled: false } as Provider;

function createSubject() {
  const dependencies: ProvidersModuleDependencies = {
    avatars: {
      persist: jest.fn(async () => 'file:///avatar'),
      resolve: jest.fn(() => 'file:///avatar'),
    },
    canRemove: jest.fn(() => true),
  };
  const backend: ProvidersModule = createProvidersModule(dependencies);
  return { backend, dependencies };
}

describe('createProvidersModule', () => {
  it('delegates provider removal policy', () => {
    const { backend, dependencies } = createSubject();

    expect(backend.canRemove(provider)).toBe(true);
    expect(dependencies.canRemove).toHaveBeenCalledWith(provider);
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
