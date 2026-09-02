import type { EffectCallback } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend, PermissionStatuses } from '@/shared/contracts';

import { usePermissionSystemStatuses } from '../hooks/usePermissionSystemStatuses';

const mockGetStatuses = jest.fn(
  async (keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, 'granted'])) as PermissionStatuses,
);
const backend = {
  permissions: { getStatuses: mockGetStatuses },
} as unknown as Backend;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
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
      renderer = create(
        <BackendProvider backend={backend}>
          <HookHarness />
        </BackendProvider>,
      );
    });
    expect(mockGetStatuses).toHaveBeenCalledTimes(1);
    expect(mockGetStatuses).toHaveBeenCalledWith([
      'location.read',
      'calendar.read',
      'calendar.write',
      'reminders.read',
      'reminders.write',
      'health.read',
    ]);

    await act(async () => appStateListener?.('background'));
    expect(mockGetStatuses).toHaveBeenCalledTimes(1);

    await act(async () => appStateListener?.('active'));
    expect(mockGetStatuses).toHaveBeenCalledTimes(2);
  });

  test('removes the app-state listener when the screen loses focus', async () => {
    await act(async () => {
      renderer = create(
        <BackendProvider backend={backend}>
          <HookHarness />
        </BackendProvider>,
      );
    });

    await act(async () => renderer?.unmount());

    expect(removeListener).toHaveBeenCalledTimes(1);
    renderer = undefined;
  });
});
