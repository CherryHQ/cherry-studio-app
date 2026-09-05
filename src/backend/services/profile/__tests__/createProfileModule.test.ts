import type { ProfileModule } from '@/shared/contracts';

import { createProfileModule, type ProfileModuleDependencies } from '../createProfileModule';

describe('createProfileModule', () => {
  it('replaces the file and persists its stable reference through one call', async () => {
    const dependencies: ProfileModuleDependencies = {
      avatars: {
        replace: jest.fn(async (_source, _previous, persist) => persist('file:next')),
        resolve: jest.fn(async (avatar) =>
          avatar === 'file:next' ? 'file:///next.png' : undefined,
        ),
      },
      preferences: {
        readAvatar: jest.fn(() => 'file:previous'),
        writeAvatar: jest.fn(async () => undefined),
      },
    };
    const backend: ProfileModule = createProfileModule(dependencies);

    await backend.persistAvatar('file:///picker.png');

    expect(dependencies.avatars.replace).toHaveBeenCalledWith(
      'file:///picker.png',
      'file:previous',
      expect.any(Function),
    );
    expect(dependencies.preferences.writeAvatar).toHaveBeenCalledWith('file:next');
    await expect(backend.resolveAvatar('file:next')).resolves.toBe('file:///next.png');
  });
});
