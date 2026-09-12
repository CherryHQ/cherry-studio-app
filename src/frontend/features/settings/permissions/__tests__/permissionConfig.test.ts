import { type DevicePermissionStatus, HEALTH_PERMISSION_SCOPES } from '@/shared/contracts';

import {
  getPermissionAction,
  getPermissionStatus,
  isPermissionSupported,
} from '../permissionConfig';

const granted: DevicePermissionStatus = { state: 'granted', canAskAgain: false };
const denied: DevicePermissionStatus = { state: 'denied', canAskAgain: false };

describe('permission settings', () => {
  test('shows add-only calendar access instead of rejecting the whole capability', () => {
    expect(
      getPermissionStatus('calendar', { 'calendar.read': denied, 'calendar.write': granted }),
    ).toMatchObject({ state: 'limited' });
  });
  test('does not infer add-only access when checking full access failed', () => {
    expect(
      getPermissionStatus('calendar', {
        'calendar.read': { state: 'error', canAskAgain: false },
        'calendar.write': granted,
      }),
    ).toMatchObject({ state: 'error' });
  });
  test('keeps partial Android health access distinct from all granted or all denied', () => {
    expect(
      getPermissionStatus('health', {
        ...Object.fromEntries(HEALTH_PERMISSION_SCOPES.map((scope) => [scope, denied])),
        'health.steps.read': granted,
      }),
    ).toMatchObject({ state: 'limited' });
  });
  test('saving photos does not imply permission to browse the library', () => {
    expect(
      getPermissionStatus('photos', { 'photos.read': denied, 'photos.write': granted }),
    ).toEqual(denied);
  });
  test('waits for all scopes needed to summarize a permission', () => {
    expect(getPermissionStatus('calendar', { 'calendar.read': granted })).toBeUndefined();
  });
  test('only hides proven unsupported capabilities, not loading or service failures', () => {
    expect(isPermissionSupported('location', {})).toBe(true);
    expect(
      isPermissionSupported('location', {
        'location.read': { state: 'error', canAskAgain: false },
      }),
    ).toBe(true);
    expect(
      isPermissionSupported('location', {
        'location.read': { state: 'unavailable', canAskAgain: false, reason: 'unsupported' },
      }),
    ).toBe(false);
  });
  test('offers another system request only when the OS can still ask', () => {
    expect(getPermissionAction({ ...denied, canAskAgain: true })).toBe('request');
    expect(getPermissionAction(denied)).toBe('open-settings');
  });
  test('keeps install, retry, and unsupported outcomes distinct', () => {
    expect(
      getPermissionAction({ state: 'unavailable', canAskAgain: false, reason: 'install-required' }),
    ).toBe('open-settings');
    expect(getPermissionAction({ state: 'error', canAskAgain: false })).toBe('retry');
    expect(
      getPermissionAction({ state: 'unavailable', canAskAgain: false, reason: 'unsupported' }),
    ).toBeUndefined();
    expect(
      getPermissionAction({ state: 'error', canAskAgain: false, reason: 'native-unavailable' }),
    ).toBeUndefined();
  });
});
