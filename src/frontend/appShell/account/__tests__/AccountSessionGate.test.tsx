import { useEffect, useLayoutEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AccountState } from '@/shared/contracts/account';

import { AccountSessionGate } from '../AccountSessionGate';

let mockState: AccountState;
let mockPathname = '/';
let mockNavigation: { key: string } | undefined;
const mockPush = jest.fn();
const mockRouter = { push: mockPush };

jest.mock('expo-router', () => ({
  useGlobalSearchParams: () => ({ sessionId: 'session-1' }),
  usePathname: () => mockPathname,
  useRootNavigationState: () => mockNavigation,
  useRouter: () => mockRouter,
  useSegments: () => ['(drawer)', '(content)', '(main)', '(chat)'],
}));
// The real controller keeps dismissal and decision semantics identical to the app's overlays.
const { createOverlayNavigation } = jest.requireActual<
  typeof import('../../../../../packages/ui/src/components/portal/overlay-navigation-controller')
>('../../../../../packages/ui/src/components/portal/overlay-navigation-controller');
let mockOverlays = createOverlayNavigation();
jest.mock('@cherrystudio/ui/components', () => ({
  ContentState: { Loading: () => null },
  useOverlayNavigation: () => mockOverlays,
}));
jest.mock('../useAccount', () => ({ useAccount: () => ({ state: mockState }) }));

let renderer: ReactTestRenderer | undefined;
let unmounts = 0;
let composer: { text: string; setText: (text: string) => void };
function Draft() {
  const [text, setText] = useState('');
  useLayoutEffect(() => {
    composer = { text, setText };
  }, [text]);
  useEffect(
    () => () => {
      unmounts++;
    },
    [],
  );
  return null;
}
async function render() {
  await act(async () => {
    const element = (
      <AccountSessionGate>
        <Draft />
      </AccountSessionGate>
    );
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    isSignedIn: true,
    isEnterprise: true,
    needsSignIn: false,
    isRestoringSession: false,
    isRestoringCommunitySession: false,
    isBusy: false,
    hasPrompted: true,
  };
  mockPathname = '/';
  mockNavigation = { key: 'root' };
  unmounts = 0;
  mockOverlays = createOverlayNavigation();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

it('covers refused enterprise data and preserves the draft through same-profile reauthentication', async () => {
  await render();
  act(() => composer.setText('Unsent text'));
  mockState = { ...mockState, needsSignIn: true, isSignedIn: false };
  await render();
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/login',
    params: { purpose: 'expired', returnTo: '/?sessionId=session-1' },
  });
  expect(
    renderer!.root.findAllByProps({ importantForAccessibility: 'no-hide-descendants' }),
  ).not.toHaveLength(0);
  mockPathname = '/login';
  await render();
  mockState = { ...mockState, needsSignIn: false, isSignedIn: true };
  mockPathname = '/';
  await render();
  expect(composer.text).toBe('Unsent text');
  expect(unmounts).toBe(0);
});

it('waits for the root navigator before requesting reauthentication', async () => {
  mockState = { ...mockState, needsSignIn: true };
  mockNavigation = undefined;
  await render();
  expect(mockPush).not.toHaveBeenCalled();
  mockNavigation = { key: 'root' };
  await render();
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it('covers a profile transition without opening expired login in the middle of activation', async () => {
  mockState = { ...mockState, needsSignIn: true, isBusy: true };
  await render();
  expect(mockPush).not.toHaveBeenCalled();
  mockState = { ...mockState, isBusy: false };
  await render();
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it('allows a callback to repair the session and leaves community guests admitted', async () => {
  mockPathname = '/auth/callback';
  mockState = { ...mockState, needsSignIn: true, isRestoringSession: true };
  await render();
  expect(mockPush).not.toHaveBeenCalled();
  expect(
    renderer!.root.findAllByProps({ importantForAccessibility: 'no-hide-descendants' }),
  ).toHaveLength(0);
  mockPathname = '/';
  mockState = { ...mockState, isEnterprise: false, isRestoringSession: false, isSignedIn: false };
  await render();
  expect(mockPush).not.toHaveBeenCalled();
});

it('closes portal sheets before login and leaves pending decisions to the user', async () => {
  const dismissSheet = jest.fn();
  let unregisterSheet = () => {};
  dismissSheet.mockImplementation(() => unregisterSheet());
  unregisterSheet = mockOverlays.register(dismissSheet);
  const unregisterDecision = mockOverlays.register();
  mockState = { ...mockState, needsSignIn: true, isSignedIn: false };
  await render();
  expect(dismissSheet).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();

  await act(async () => unregisterDecision());
  expect(dismissSheet).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledTimes(1);
});
