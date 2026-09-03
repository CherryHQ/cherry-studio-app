import { providerSetupHref, readProviderSetupReturnTo } from '../providerSetupRoute';

describe('provider setup route', () => {
  test('carries the requesting pathname into the provider catalog', () => {
    expect(providerSetupHref('/agents/new')).toEqual({
      params: { returnTo: '/agents/new' },
      pathname: '/settings/provider/catalog',
    });
  });

  test('accepts internal pathnames and rejects non-path destinations', () => {
    expect(readProviderSetupReturnTo('/agents/agent-1/edit')).toBe('/agents/agent-1/edit');
    expect(readProviderSetupReturnTo(['/settings/model', '/ignored'])).toBe('/settings/model');
    expect(readProviderSetupReturnTo('/?sessionId=session-1')).toBe('/?sessionId=session-1');
    expect(readProviderSetupReturnTo('https://example.com')).toBeUndefined();
    expect(readProviderSetupReturnTo('//example.com')).toBeUndefined();
    expect(readProviderSetupReturnTo('/agents/new#details')).toBeUndefined();
  });
});
