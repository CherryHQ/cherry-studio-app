import { canRequestDevicePermission, canUseDevicePermission } from '../permissions';

describe('device permission execution contract', () => {
  test.each([
    ['photos.read', 'limited', true],
    ['calendar.read', 'limited', false],
    ['camera.read', 'granted', true],
    ['calendar.read', 'error', false],
    ['calendar.read', 'denied', false],
    ['location.read', 'unavailable', false],
  ] as const)('%s with %s permits execution: %s', (scope, state, expected) => {
    expect(canUseDevicePermission(scope, { state, canAskAgain: false })).toBe(expected);
  });

  test('missing status never authorizes or requests access', () => {
    expect(canUseDevicePermission('camera.read', undefined)).toBe(false);
    expect(canRequestDevicePermission(undefined)).toBe(false);
  });

  test.each(['undetermined', 'denied'] as const)(
    'the OS retry flag controls requesting a %s permission',
    (state) => {
      expect(canRequestDevicePermission({ state, canAskAgain: true })).toBe(true);
      expect(canRequestDevicePermission({ state, canAskAgain: false })).toBe(false);
    },
  );

  test.each(['granted', 'limited', 'error', 'unavailable'] as const)(
    '%s cannot prompt even with a stale retry flag',
    (state) => {
      expect(canRequestDevicePermission({ state, canAskAgain: true })).toBe(false);
    },
  );
});
