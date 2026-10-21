import { LOCAL_PROFILE } from '@/shared/data/activeProfile';

import { ProfileRegistry } from '../ProfileRegistry';

jest.mock('@logger', () => ({
  loggerService: { withContext: () => ({ error: jest.fn() }) },
}));

const identity = {
  deployment: 'server-1',
  issuer: 'https://auth.example.com',
  subject: 'user-1',
  productProfileId: 'org-1',
};

function createRegistry(initial?: string) {
  let stored = initial;
  let next = 0;
  const ids = ['8a1f4e9c-2b7d-4c1a-9e3f-1d2c3b4a5f60', '9b2e5f0d-3c8e-4d2b-8f4a-2e3d4c5b6a71'];
  const registry = new ProfileRegistry(
    { read: () => stored, write: (value) => (stored = value) },
    () => ids[next++]!,
  );
  return { registry, stored: () => stored };
}

describe('ProfileRegistry', () => {
  it('opens local data until an enterprise profile is selected', () => {
    const { registry } = createRegistry();
    expect(registry.getActive()).toBe(LOCAL_PROFILE);
  });

  it('reuses one profile per identity and persists the next launch selection', () => {
    const { registry, stored } = createRegistry();
    const profile = registry.resolve(identity);
    expect(registry.resolve({ ...identity })).toEqual(profile);
    expect(registry.resolve({ ...identity, productProfileId: 'org-2' }).id).not.toBe(profile.id);

    registry.setActive(profile);
    expect(createRegistry(stored()).registry.getActive()).toEqual(profile);
  });

  it('falls back to local data when the directory is unreadable', () => {
    const { registry, stored } = createRegistry('{not json');
    expect(registry.getActive()).toBe(LOCAL_PROFILE);
    expect(JSON.parse(stored()!)).toEqual({ version: 1, profiles: [], active: 'local' });
  });
});
