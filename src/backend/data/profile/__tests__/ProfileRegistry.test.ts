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

  it('keeps the recorded organization name when a later sign-in cannot read it', () => {
    const { registry, stored } = createRegistry();
    registry.resolve(identity, 'https://a.example.com', 'Acme');
    const profile = registry.resolve(identity, 'https://a.example.com');
    registry.setActive(profile);
    expect(profile).toMatchObject({ displayName: 'Acme' });
    expect(createRegistry(stored()).registry.getActive()).toMatchObject({ displayName: 'Acme' });
  });

  it('reuses one profile per identity and persists the next launch selection', () => {
    const { registry, stored } = createRegistry();
    const profile = registry.resolve(identity, 'https://a.example.com');
    // A moved server keeps its data and records the new address.
    const moved = registry.resolve({ ...identity }, 'https://b.example.com');
    expect(moved).toEqual({ ...profile, address: 'https://b.example.com' });
    expect(
      registry.resolve({ ...identity, productProfileId: 'org-2' }, 'https://a.example.com').id,
    ).not.toBe(profile.id);

    registry.setActive(moved);
    expect(createRegistry(stored()).registry.getActive()).toEqual(moved);
  });

  it.each(['{not json', ''])('preserves an unreadable directory (%j) and refuses writes', (raw) => {
    const { registry, stored } = createRegistry(raw);
    expect(registry.getActive()).toBe(LOCAL_PROFILE);
    expect(() => registry.resolve(identity, 'https://a.example.com')).toThrow('unavailable');
    expect(() => registry.setActive(LOCAL_PROFILE)).toThrow('unavailable');
    expect(stored()).toBe(raw);
  });

  it('retries a failed storage read without losing the existing identity mapping', () => {
    const original = createRegistry();
    const profile = original.registry.resolve(identity, 'https://a.example.com');
    let stored = original.stored();
    const read = jest
      .fn(() => stored)
      .mockImplementationOnce(() => {
        throw new Error('Storage temporarily unavailable');
      });
    const write = jest.fn((value: string) => (stored = value));
    const createId = jest.fn();
    const registry = new ProfileRegistry({ read, write }, createId);
    expect(registry.getActive()).toBe(LOCAL_PROFILE);
    expect(write).not.toHaveBeenCalled();
    expect(registry.resolve(identity, 'https://moved.example.com').id).toBe(profile.id);
    expect(createId).not.toHaveBeenCalled();
    registry.setActive(profile);
    expect(createRegistry(stored).registry.getActive().id).toBe(profile.id);
  });

  it('isolates private identities from portal identities and retains them across server moves', () => {
    const { registry, stored } = createRegistry();
    const cloud = registry.resolve(identity, 'https://cloud.example.com');
    const privateIdentity = {
      authentication: 'password' as const,
      deployment: identity.deployment,
      subject: identity.subject,
    };
    const privateProfile = registry.resolve(privateIdentity, 'https://private.example.com');
    expect(privateProfile.id).not.toBe(cloud.id);
    const moved = registry.resolve(privateIdentity, 'https://moved.example.com/api');
    expect(moved.id).toBe(privateProfile.id);
    registry.setActive(moved);
    expect(createRegistry(stored()).registry.getActive()).toEqual(moved);
  });
});
