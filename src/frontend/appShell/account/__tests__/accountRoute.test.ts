import { accountSessionReturnTo, accountSignInHref, readAccountReturnTo } from '../accountRoute';

it('keeps the originating chat identity when opening reauthentication', () => {
  const returnTo = accountSessionReturnTo('/', { sessionId: 'session-1', messageId: 'message-2' }, [
    '(drawer)',
    '(content)',
    '(main)',
    '(chat)',
  ]);
  expect(accountSignInHref(returnTo, { purpose: 'expired' })).toEqual({
    pathname: '/login',
    params: { purpose: 'expired', returnTo: '/?sessionId=session-1&messageId=message-2' },
  });
});

it('keeps cancellation separate from the post-login destination', () => {
  const returnTo = '/settings/provider/cherryai-subscription';
  const cancelTo = '/settings/provider';
  expect(accountSignInHref(returnTo, { cancelTo })).toEqual({
    pathname: '/login',
    params: { returnTo, cancelTo },
  });
  expect(accountSignInHref(returnTo, { cancelTo: '/login' }).params).toEqual({ returnTo });
});

it('does not duplicate entity parameters already encoded in the route path', () => {
  expect(
    accountSessionReturnTo(
      '/settings/device-connections/desktop-1',
      { connectionId: 'desktop-1', filter: 'all devices' },
      ['(drawer)', 'settings', 'device-connections', '[connectionId]'],
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
