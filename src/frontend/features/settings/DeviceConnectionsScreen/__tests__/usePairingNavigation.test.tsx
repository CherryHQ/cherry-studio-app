import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { NavigationShellContext } from '@/frontend/appShell/navigationShell/state';

import { usePairingNavigation } from '../usePairingNavigation';

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(),
  dismissTo: jest.fn(),
  replace: jest.fn(),
};
const mockAllowLeave = jest.fn();
const mockPreventRemove = jest.fn((_enabled: boolean, _callback: () => void) => mockAllowLeave);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePreventRemove: (enabled: boolean, callback: () => void) =>
    mockPreventRemove(enabled, callback),
}));

let renderer: ReactTestRenderer | undefined;
let cancel: () => void;
function Probe(props: Parameters<typeof usePairingNavigation>[0]) {
  const navigation = usePairingNavigation(props);
  useLayoutEffect(() => {
    cancel = navigation.cancel;
  });
  return null;
}
function render(props: Parameters<typeof usePairingNavigation>[0]) {
  act(() => {
    renderer = create(<Probe {...props} />);
  });
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

it('returns to the retained entry instead of rebuilding the device list', () => {
  mockRouter.canGoBack.mockReturnValue(true);
  render({});
  act(() => cancel());
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('provides a deterministic device target for a cold entry with no back history', () => {
  mockRouter.canGoBack.mockReturnValue(false);
  render({ connectionId: 'desktop-1' });
  act(() => cancel());
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/settings/device-connections/[connectionId]',
    params: { connectionId: 'desktop-1' },
  });
});

it('discards a missing repair target rather than returning to its removed detail', () => {
  mockRouter.canGoBack.mockReturnValue(true);
  render({ isMissingConnection: true });
  act(() => cancel());
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/settings/device-connections');
  expect(mockRouter.back).not.toHaveBeenCalled();
});

it('applies the same missing-connection exit to native back', () => {
  render({ isMissingConnection: true });
  const args = mockPreventRemove.mock.calls.at(-1)!;
  expect(args[0]).toBe(true);
  act(() => args[1]());
  expect(mockAllowLeave).toHaveBeenCalled();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/settings/device-connections');
});

it('uses /devices base route when inside standalone devices destination', () => {
  mockRouter.canGoBack.mockReturnValue(false);
  act(() => {
    renderer = create(
      <NavigationShellContext value={{ activeDestination: 'devices' } as never}>
        <Probe connectionId="desktop-1" />
      </NavigationShellContext>,
    );
  });
  act(() => cancel());
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/devices/[connectionId]',
    params: { connectionId: 'desktop-1' },
  });
});
