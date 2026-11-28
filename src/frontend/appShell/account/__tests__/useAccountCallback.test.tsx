import { getLinkingURL } from 'expo-linking';
import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { redirectSystemPath as redirectUuRemoteSystemPath } from '@/frontend/appShell/uuRemote/nativeIntent';
import type { PreferenceSchema } from '@/shared/data/preference';

import { routeAccountCallback } from '../nativeIntent';
import { useAccountCallback } from '../useAccountCallback';

const accountUrl = 'cherrystudio://auth/callback?code=one-use';
let mockDelivery: string | undefined;
let mockNextId = 0;
const mockRetireNativeUrl = jest.fn(async (_url: string) => {});
let mockReturnTo: string | undefined;
let mockOnboarding: PreferenceSchema['app.onboarding.status'];
let mockNeedsSignIn = false;
const mockReceiveRedirect = jest.fn<Promise<boolean> | null, [string]>();
const mockReportError = jest.fn();
const mockRouter = { dismissTo: jest.fn() };
const mockAccount = {
  receiveRedirect: mockReceiveRedirect,
  getState: () => ({ isEnterprise: mockNeedsSignIn, needsSignIn: mockNeedsSignIn }),
};

jest.mock('../../../../../modules/system-integration/linking', () => ({
  retireNativeUrl: (url: string) => mockRetireNativeUrl(url),
}));
jest.mock('expo-linking', () => ({ getLinkingURL: jest.fn() }));
jest.mock('expo-constants', () => ({ expoConfig: { scheme: 'cherrystudio' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => String(++mockNextId) }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ delivery: mockDelivery }),
  useRouter: () => mockRouter,
}));
jest.mock('@/frontend/data', () => ({ usePreference: () => [mockOnboarding] }));
jest.mock('../accountNavigation', () => ({
  getAccountReturnTo: (fallback: string) => mockReturnTo ?? fallback,
}));
jest.mock('../useAccount', () => ({ useAccount: () => ({ account: mockAccount }) }));
jest.mock('../useAccountErrorReporter', () => ({ useAccountErrorReporter: () => mockReportError }));

let renderer: ReactTestRenderer | undefined;
function Probe() {
  useAccountCallback();
  return null;
}
function route(url: string, initial = false) {
  const intent = { path: url, initial };
  const path = routeAccountCallback(intent, redirectUuRemoteSystemPath(intent));
  if (path !== null) {
    mockDelivery = new URL(path, 'https://route.invalid').searchParams.get('delivery') ?? undefined;
  }
  return path;
}
function render() {
  act(() => {
    if (renderer) renderer.update(<Probe />);
    else renderer = create(<Probe />);
  });
}
beforeEach(() => {
  route('/', true);
  jest.clearAllMocks();
  jest.mocked(getLinkingURL).mockReturnValue(null);
  route(accountUrl, true);
  mockReturnTo = '/settings';
  mockOnboarding = 'completed';
  mockNeedsSignIn = false;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
});

it('returns to the saved caller after a rerender, exchanging the staged account callback only once', async () => {
  let finish!: (value: boolean) => void;
  mockReceiveRedirect.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render();
  expect(mockRetireNativeUrl).not.toHaveBeenCalled();
  render();
  await act(async () => finish(true));
  expect(mockReceiveRedirect).toHaveBeenCalledTimes(1);
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
});

it('abandons an unmounted delivery after navigation to another feature and exits a direct visit', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(getLinkingURL).mockReturnValue(accountUrl);
  const abandoned = mockDelivery;
  const other = 'cherrystudio://oauth/callback?code=provider';
  expect(route(other)).toBe(other);
  mockDelivery = abandoned;
  render();
  expect(mockReceiveRedirect).not.toHaveBeenCalled();
  expect(mockRetireNativeUrl.mock.calls).toEqual([[accountUrl]]);
  expect(getLinkingURL).not.toHaveBeenCalled();
  expect(mockReportError).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/settings');
});

it('claims the cold account URL after a warm in-place return replaced the native URL before mount', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const other = 'cherrystudio://uu-remote/callback?request=other';
  const ticket = mockDelivery;
  expect(route(other)).toBeNull();
  jest.mocked(getLinkingURL).mockReturnValue(other);
  expect(mockDelivery).toBe(ticket);
  mockReceiveRedirect.mockResolvedValueOnce(true);
  await act(async () => render());
  expect(mockReceiveRedirect.mock.calls).toEqual([[accountUrl]]);
  expect(mockRetireNativeUrl).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
});

it.each(['ios', 'android'] as const)(
  'recovers a later %s account callback received before Router subscribed',
  async (os) => {
    jest.replaceProperty(Platform, 'OS', os);
    const latest = 'cherrystudio://auth/callback?state=current&code=next';
    jest.mocked(getLinkingURL).mockReturnValue(latest);
    mockReceiveRedirect.mockRejectedValueOnce(new Error('stale state')).mockResolvedValueOnce(true);
    await act(async () => render());
    expect(mockReceiveRedirect.mock.calls).toEqual([[accountUrl], [latest]]);
    expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
    expect(mockReportError).not.toHaveBeenCalled();
  },
);

it.each([accountUrl, 'cherrystudio-preview://auth/callback?code=another-app'])(
  'keeps one delivery for an identical or foreign-scheme Android latest URL',
  async (latest) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.mocked(getLinkingURL).mockReturnValue(latest);
    mockReceiveRedirect.mockResolvedValueOnce(true);
    await act(async () => render());
    expect(mockReceiveRedirect.mock.calls).toEqual([[accountUrl]]);
  },
);

it('does not promote the abandoned native latest link into a new warm account route', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  route('/settings');
  const warm = 'cherrystudio://auth/callback?code=new';
  route(warm);
  jest.mocked(getLinkingURL).mockReturnValue(accountUrl);
  mockReceiveRedirect.mockResolvedValueOnce(true);
  await act(async () => render());
  expect(getLinkingURL).not.toHaveBeenCalled();
  expect(mockReceiveRedirect.mock.calls).toEqual([[warm]]);
});

it('exits a direct account route without a callback', () => {
  expect(route('/auth/callback')).toBe('/auth/callback');
  render();
  expect(mockReceiveRedirect).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/settings');
});

it('delivers distinct account links in order when both arrive before the route mounts', async () => {
  const second = 'cherrystudio://auth/callback?code=second';
  const target = route(second);
  expect(target).toBe(`/auth/callback?delivery=${mockDelivery}`);
  expect(target).not.toContain('code=');
  mockReceiveRedirect
    .mockRejectedValueOnce(new Error('stale callback'))
    .mockResolvedValueOnce(true);
  await act(async () => render());
  expect(mockReceiveRedirect.mock.calls).toEqual([[accountUrl], [second]]);
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
  expect(mockReportError).not.toHaveBeenCalled();
});

it.each(['success', 'failure'] as const)(
  'presents the pending account %s after an unrelated warm link',
  async (outcome) => {
    const account = Promise.withResolvers<boolean>();
    mockReceiveRedirect.mockReturnValueOnce(account.promise);
    render();
    route('cherrystudio://uu-remote/callback?request=other');
    render();
    const failure = new Error('Exchange failed');
    await act(async () => {
      if (outcome === 'success') account.resolve(true);
      else account.reject(failure);
    });
    expect(mockRetireNativeUrl).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
    if (outcome === 'success') expect(mockReportError).not.toHaveBeenCalled();
    else expect(mockReportError).toHaveBeenCalledWith(failure, 'account.callback');
  },
);

it('handles a second link on the mounted route if the first callback is rejected', async () => {
  let rejectFirst!: (error: Error) => void;
  mockReceiveRedirect.mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectFirst = reject;
    }),
  );
  mockReceiveRedirect.mockResolvedValueOnce(true);
  render();
  route('cherrystudio://auth/callback?code=current');
  render();
  await act(async () => rejectFirst(new Error('stale callback')));
  expect(mockReceiveRedirect.mock.calls).toEqual([
    ['cherrystudio://auth/callback?code=one-use'],
    ['cherrystudio://auth/callback?code=current'],
  ]);
  expect(mockReportError).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
});

it('keeps a successful route completion when an overlapping link is rejected', async () => {
  let accept!: (stayed: boolean) => void;
  mockReceiveRedirect.mockReturnValueOnce(
    new Promise((resolve) => {
      accept = resolve;
    }),
  );
  mockReceiveRedirect.mockRejectedValueOnce(new Error('stale callback'));
  render();
  route('cherrystudio://auth/callback?code=stale');
  render();
  await act(async () => accept(true));
  expect(mockReportError).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
});

it('uses persisted onboarding progress as the cold-callback fallback', async () => {
  mockReturnTo = undefined;
  mockOnboarding = 'login';
  mockReceiveRedirect.mockResolvedValueOnce(true);
  await act(async () => render());
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/onboarding');
});

it('keeps a refused enterprise session on its retry route after callback failure', async () => {
  mockReturnTo = '/?sessionId=session-1';
  mockNeedsSignIn = true;
  const failure = new Error('Authentication rejected');
  mockReceiveRedirect.mockRejectedValueOnce(failure);
  await act(async () => render());
  expect(mockReportError).toHaveBeenCalledWith(failure, 'account.callback');
  expect(mockRouter.dismissTo).toHaveBeenCalledWith({
    pathname: '/login',
    params: { purpose: 'expired', returnTo: '/?sessionId=session-1' },
  });
});

it('does not restore an old page after the callback route has been left', async () => {
  let finish!: (value: boolean) => void;
  mockReceiveRedirect.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render();
  act(() => renderer?.unmount());
  renderer = undefined;
  await act(async () => finish(true));
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});

it('leaves navigation to profile activation when authentication switches data spaces', async () => {
  mockReceiveRedirect.mockResolvedValueOnce(false);
  await act(async () => render());
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});
