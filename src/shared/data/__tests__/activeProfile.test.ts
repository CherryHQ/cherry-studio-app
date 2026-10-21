import { LOCAL_PROFILE, profileScopedName, setActiveProfile } from '../activeProfile';

describe('profileScopedName', () => {
  afterEach(() => setActiveProfile(LOCAL_PROFILE));

  it('keeps the original store and key names for local data', () => {
    expect(profileScopedName('remote-device-identity')).toBe('remote-device-identity');
  });

  it('separates every enterprise profile without a storage generation', () => {
    setActiveProfile({
      id: '8a1f4e9c-2b7d-4c1a-9e3f-1d2c3b4a5f60',
      identity: { deployment: 's', issuer: 'i', subject: 'u', productProfileId: 'o' },
    });
    expect(profileScopedName('cherry-cache-persist')).toBe(
      'profile.8a1f4e9c-2b7d-4c1a-9e3f-1d2c3b4a5f60.cherry-cache-persist',
    );
  });
});
