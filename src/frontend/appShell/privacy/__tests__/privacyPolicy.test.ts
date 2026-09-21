import { getPrivacyPolicyUrl } from '../privacyPolicy';

const mockExtra: Record<string, unknown> = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      get extra() {
        return mockExtra;
      },
    },
  },
}));

afterEach(() => {
  delete mockExtra.privacyPolicyUrl;
});

it('reads the address the build was configured with', () => {
  mockExtra.privacyPolicyUrl = '  https://example.com/privacy  ';
  expect(getPrivacyPolicyUrl()).toBe('https://example.com/privacy');
});

it.each([undefined, '', '   ', 42])(
  'reports no link for %p rather than rendering a dead one',
  (value) => {
    mockExtra.privacyPolicyUrl = value;
    expect(getPrivacyPolicyUrl()).toBeUndefined();
  },
);
