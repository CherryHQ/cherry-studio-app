import { redirectSystemPath } from '../redirectSystemPath';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { ios: { infoPlist: { GIDClientID: '123-example.apps.googleusercontent.com' } } },
  },
}));

const callback =
  'com.googleusercontent.apps.123-example:/oauthredirect?code=private-code&state=private-state';

it('keeps a live Google callback out of navigation and its route parameters', () => {
  expect(redirectSystemPath({ path: callback, initial: false })).toBeNull();
});

it('opens a fresh connection page without callback credentials after process restart', () => {
  expect(redirectSystemPath({ path: callback, initial: true })).toBe('/plugins/gmail/connect');
});

it.each([
  '/settings',
  'cherrystudio-dev://plugins/github/callback?code=github-code',
  'other:/callback',
])('preserves unrelated routes: %s', (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe(path);
});
