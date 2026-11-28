import { clearInitialURL } from 'expo-linking';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PreferenceSchema } from '@/shared/data/preference';

import { useAccountCallback } from '../useAccountCallback';

let mockUrl: string | null;
let mockNativeUrl: string | null;
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

jest.mock('expo-linking', () => ({
  clearInitialURL: jest.fn(),
  getLinkingURL: () => mockNativeUrl,
  useLinkingURL: () => mockUrl,
}));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
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
function render() {
  act(() => {
    if (renderer) renderer.update(<Probe />);
    else renderer = create(<Probe />);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockUrl = 'cherrystudio://auth/callback?code=one-use';
  mockNativeUrl = mockUrl;
  mockReturnTo = '/settings';
  mockOnboarding = 'completed';
  mockNeedsSignIn = false;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

it('returns to the saved caller after the URL is cleared, exchanging the callback only once', async () => {
  let finish!: (value: boolean) => void;
  mockReceiveRedirect.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render();
  expect(clearInitialURL).toHaveBeenCalledTimes(1);
  mockUrl = null;
  render();
  await act(async () => finish(true));
  expect(mockReceiveRedirect).toHaveBeenCalledTimes(1);
  expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
});

it('leaves another feature’s callback in the native URL cache', () => {
  mockUrl = mockNativeUrl = 'cherrystudio://oauth/callback?code=provider';
  mockReceiveRedirect.mockReturnValueOnce(null);
  render();
  expect(clearInitialURL).not.toHaveBeenCalled();
  expect(mockReportError).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});

it.each(['success', 'failure'] as const)(
  'presents the pending account %s after an unrelated warm link',
  async (outcome) => {
    const account = Promise.withResolvers<boolean>();
    mockReceiveRedirect.mockReturnValueOnce(account.promise).mockReturnValueOnce(null);
    render();
    mockUrl = mockNativeUrl = 'cherrystudio://uu-remote/callback?request=other';
    render();
    const failure = new Error('Exchange failed');
    await act(async () => {
      if (outcome === 'success') account.resolve(true);
      else account.reject(failure);
    });
    expect(clearInitialURL).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo.mock.calls).toEqual([['/settings']]);
    if (outcome === 'success') expect(mockReportError).not.toHaveBeenCalled();
    else expect(mockReportError).toHaveBeenCalledWith(failure, 'account.callback');
  },
);

it('does not clear a newer native URL while delivering an earlier account link', async () => {
  mockNativeUrl = 'cherrystudio://oauth/callback?code=provider';
  mockReceiveRedirect.mockResolvedValueOnce(true);
  await act(async () => render());
  expect(clearInitialURL).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/settings');
});

it('handles a second link on the mounted route if the first callback is rejected', async () => {
  let rejectFirst!: (error: Error) => void;
  mockReceiveRedirect.mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectFirst = reject;
    }),
  );
  mockReceiveRedirect.mockResolvedValueOnce(true);
  render();
  mockUrl = 'cherrystudio://auth/callback?code=current';
  render();
  await act(async () => rejectFirst(new Error('stale callback')));
  expect(mockReceiveRedirect.mock.calls).toEqual([
    ['cherrystudio://auth/callback?code=one-use'],
    [mockUrl],
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
  mockUrl = 'cherrystudio://auth/callback?code=stale';
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
