import { type EffectCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend, PermissionStatuses } from '@/shared/contracts';

import { usePermissionSystemStatuses } from '../hooks/usePermissionSystemStatuses';

const mockGetStatuses = jest.fn(
  async (keys: readonly string[]) =>
    Object.fromEntries(
      keys.map((key) => [key, { state: 'granted', canAskAgain: false }]),
    ) as PermissionStatuses,
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

// The platform presentation contributes scope configuration; this hook test
// does not render its native image component.
jest.mock('@cherrystudio/ui/components', () => ({ Image: () => null }));

let latestStatuses: PermissionStatuses;

function HookHarness() {
  const { statuses } = usePermissionSystemStatuses();
  useEffect(() => {
    latestStatuses = statuses;
  }, [statuses]);
  return null;
}

describe('usePermissionSystemStatuses', () => {
  let renderer: ReactTestRenderer | undefined;
  let appStateListener: ((state: string) => void) | undefined;
  const removeListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    latestStatuses = {};
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
      'health.steps.read',
      'health.activeEnergy.read',
      'health.distance.read',
      'health.heartRate.read',
      'health.restingHeartRate.read',
      'health.hrv.read',
      'health.sleep.read',
      'health.workouts.read',
      'camera.read',
      'photos.read',
      'photos.write',
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

  test('an older lookup cannot overwrite permissions refreshed after returning from Settings', async () => {
    let resolveFirst!: (statuses: PermissionStatuses) => void;
    mockGetStatuses.mockImplementationOnce(
      () =>
        new Promise<PermissionStatuses>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    await act(async () => {
      renderer = create(
        <BackendProvider backend={backend}>
          <HookHarness />
        </BackendProvider>,
      );
    });
    await act(async () => appStateListener?.('active'));
    expect(latestStatuses['camera.read']?.state).toBe('granted');

    await act(async () => resolveFirst({ 'camera.read': { state: 'denied', canAskAgain: false } }));
    expect(latestStatuses['camera.read']?.state).toBe('granted');
  });

  test('failed lookups replace stale grants with an explicit error', async () => {
    await act(async () => {
      renderer = create(
        <BackendProvider backend={backend}>
          <HookHarness />
        </BackendProvider>,
      );
    });
    expect(latestStatuses['camera.read']?.state).toBe('granted');
    mockGetStatuses.mockRejectedValueOnce(new Error('Native lookup failed'));
    await act(async () => appStateListener?.('active'));
    expect(latestStatuses['camera.read']).toEqual({ state: 'error', canAskAgain: false });
  });
});
