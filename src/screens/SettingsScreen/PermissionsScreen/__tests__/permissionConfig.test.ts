import type { PermissionPolicySnapshot } from '../permissionConfig';
import { getPermissionSummaryKey } from '../permissionConfig';

const neverPolicies: PermissionPolicySnapshot = {
  'permissions.calendar_read': 'never',
  'permissions.calendar_write': 'never',
  'permissions.health_read': 'never',
  'permissions.location_read': 'never',
  'permissions.reminders_read': 'never',
  'permissions.reminders_write': 'never',
};

describe('getPermissionSummaryKey', () => {
  test.each([
    ['never', 'settings.permissions.summary.never'],
    ['ask', 'settings.permissions.summary.ask'],
    ['always', 'settings.permissions.summary.allowed'],
  ] as const)('summarizes single-scope mode %s', (mode, expected) => {
    expect(
      getPermissionSummaryKey('location', {
        ...neverPolicies,
        'permissions.location_read': mode,
      }),
    ).toBe(expected);
  });

  test.each([
    ['never', 'never', 'settings.permissions.summary.never'],
    ['ask', 'never', 'settings.permissions.summary.readOnly'],
    ['never', 'always', 'settings.permissions.summary.writeOnly'],
    ['always', 'ask', 'settings.permissions.summary.readWrite'],
  ] as const)('summarizes calendar read=%s write=%s', (read, write, expected) => {
    expect(
      getPermissionSummaryKey('calendar', {
        ...neverPolicies,
        'permissions.calendar_read': read,
        'permissions.calendar_write': write,
      }),
    ).toBe(expected);
  });
});
