import type { EffectCallback } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePermissionSystemStatuses } from '../hooks/usePermissionSystemStatuses';

const mockGetStatus = jest.fn(async () => 'granted');
const mockDevicePermission = { getStatusForPreference: mockGetStatus };

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));
jest.mock('@/bootstrap', () => ({
  useDataServices: () => ({
    devicePermission: mockDevicePermission,
  }),
}));

function HookHarness() {
  usePermissionSystemStatuses();
  return null;
}

describe('usePermissionSystemStatuses', () => {
  let renderer: ReactTestRenderer | undefined;
  let appStateListener: ((state: string) => void) | undefined;
  const removeListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: removeListener };
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  test('refreshes permissions when the focused app returns to the foreground', async () => {
    await act(async () => {
      renderer = create(<HookHarness />);
    });
    expect(mockGetStatus).toHaveBeenCalledTimes(6);

    await act(async () => appStateListener?.('background'));
    expect(mockGetStatus).toHaveBeenCalledTimes(6);

    await act(async () => appStateListener?.('active'));
    expect(mockGetStatus).toHaveBeenCalledTimes(12);
  });

  test('removes the app-state listener when the screen loses focus', async () => {
    await act(async () => {
      renderer = create(<HookHarness />);
    });

    await act(async () => renderer?.unmount());

    expect(removeListener).toHaveBeenCalledTimes(1);
    renderer = undefined;
  });
});
