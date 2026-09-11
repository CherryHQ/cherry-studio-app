import { backgroundActivityHref } from '../backgroundActivityNavigation';

// Expo Linking reads native execution metadata even when parsing an explicit
// URL. Give its real parser the custom development client's environment.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual<typeof import('expo-constants')>('expo-constants');
  return {
    ...actual,
    __esModule: true,
    default: {
      ...actual.default,
      executionEnvironment: actual.ExecutionEnvironment.Bare,
      expoConfig: { scheme: ['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'] },
    },
  };
});

test.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
  'resolves task links for the %s variant without opening arbitrary destinations',
  (scheme) => {
    expect(backgroundActivityHref(`${scheme}:///?agentId=a&sessionId=s`, scheme)).toEqual({
      pathname: '/',
      params: { agentId: 'a', sessionId: 's' },
    });
    expect(backgroundActivityHref(`${scheme}://paintings/p`, scheme)).toEqual({
      pathname: '/paintings/[paintingId]',
      params: { paintingId: 'p' },
    });
    expect(backgroundActivityHref('https://example.com/paintings/p', scheme)).toBeUndefined();
    expect(backgroundActivityHref(`${scheme}://settings`, scheme)).toBeUndefined();
    expect(backgroundActivityHref(`${scheme}:///?agentId=a`, scheme)).toBeUndefined();
    expect(backgroundActivityHref(`${scheme}://paintings/%E0%A4`, scheme)).toBeUndefined();
  },
);
