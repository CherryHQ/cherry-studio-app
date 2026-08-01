import type { ProfileBackend } from '@/shared/contracts';

import { ProfileService, type ProfileServiceDependencies } from '../ProfileService';

describe('ProfileService', () => {
  it('replaces the file and persists its stable reference through one call', async () => {
    const dependencies: ProfileServiceDependencies = {
      avatars: {
        replace: jest.fn(async (_source, _previous, persist) => persist('file:next')),
        resolve: jest.fn((avatar) => (avatar === 'file:next' ? 'file:///next.png' : undefined)),
      },
      preferences: {
        readAvatar: jest.fn(() => 'file:previous'),
        writeAvatar: jest.fn(async () => undefined),
      },
    };
    const backend: ProfileBackend = new ProfileService(dependencies);

    await backend.persistAvatar('file:///picker.png');

    expect(dependencies.avatars.replace).toHaveBeenCalledWith(
      'file:///picker.png',
      'file:previous',
      expect.any(Function),
    );
    expect(dependencies.preferences.writeAvatar).toHaveBeenCalledWith('file:next');
    expect(backend.resolveAvatar('file:next')).toBe('file:///next.png');
  });
});
