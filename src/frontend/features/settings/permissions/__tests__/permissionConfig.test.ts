import type { PermissionStatuses } from '@/shared/contracts';

import { getPermissionAction, getPermissionStatus } from '../permissionConfig';

const grantedStatuses: PermissionStatuses = {
  'calendar.read': 'granted',
  'calendar.write': 'granted',
  'health.read': 'granted',
  'location.read': 'granted',
  'reminders.read': 'granted',
  'reminders.write': 'granted',
};

describe('getPermissionStatus', () => {
  it('returns the system state for a single-scope permission', () => {
    expect(
      getPermissionStatus('location', {
        ...grantedStatuses,
        'location.read': 'undetermined',
      }),
    ).toBe('undetermined');
  });

  it('requires every scope of a grouped system permission', () => {
    expect(
      getPermissionStatus('calendar', {
        ...grantedStatuses,
        'calendar.read': 'denied',
      }),
    ).toBe('denied');
  });

  it('keeps the initial state loading until every scope has been checked', () => {
    expect(getPermissionStatus('calendar', { 'calendar.read': 'granted' })).toBeUndefined();
  });
});

describe('getPermissionAction', () => {
  it('requests an undetermined permission', () => {
    expect(getPermissionAction('undetermined')).toBe('request');
  });

  it.each(['denied', 'granted'] as const)(
    'opens system settings for an already determined %s permission',
    (status) => {
      expect(getPermissionAction(status)).toBe('open-settings');
    },
  );

  it.each([undefined, 'unavailable'] as const)(
    'does not offer an action for an unavailable permission state',
    (status) => {
      expect(getPermissionAction(status)).toBeUndefined();
    },
  );
});
