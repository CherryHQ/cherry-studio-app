import { isSystemProviderId, SystemProviderIds } from '../providerIds';

describe('Radeon Cloud system provider id', () => {
  test('recognizes the registry preset as a system provider', () => {
    expect(SystemProviderIds['radeon-cloud']).toBe('radeon-cloud');
    expect(isSystemProviderId('radeon-cloud')).toBe(true);
  });
});
