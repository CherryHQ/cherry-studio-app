import { accountSessionReturnTo, accountSignInHref, readAccountReturnTo } from '../accountRoute';

it('keeps the originating chat identity when opening reauthentication', () => {
  const returnTo = accountSessionReturnTo('/', { sessionId: 'session-1', messageId: 'message-2' }, [
    '(drawer)',
    '(main)',
    '(chat)',
  ]);
  expect(accountSignInHref(returnTo, 'expired')).toEqual({
    pathname: '/login',
    params: { purpose: 'expired', returnTo: '/?sessionId=session-1&messageId=message-2' },
  });
});

it('does not duplicate entity parameters already encoded in the route path', () => {
  expect(
    accountSessionReturnTo(
      '/settings/device-connections/desktop-1',
      { connectionId: 'desktop-1', filter: 'all devices' },
      ['(drawer)', '(main)', 'settings', 'device-connections', '[connectionId]'],
    ),
  ).toBe('/settings/device-connections/desktop-1?filter=all+devices');
});

it.each([
  'https://example.com',
  '//example.com',
  '/login',
  '/login?returnTo=%2F',
  '/auth/callback?code=secret',
  '/settings#profile',
  '/login/',
  '/settings/../login',
  '/oauth/callback?code=secret',
  '/plugins/mcp/oauth-callback?state=secret',
])('rejects unsafe or recursive login destinations: %s', (value) => {
  expect(readAccountReturnTo(value)).toBeUndefined();
  expect(accountSignInHref(value).params.returnTo).toBe('/settings/profile');
});

it('accepts the caller target from route parameters without selecting another value', () => {
  expect(readAccountReturnTo(['/settings', '/ignored'])).toBe('/settings');
  expect(readAccountReturnTo('/onboarding')).toBe('/onboarding');
});
