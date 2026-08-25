import type { PermissionStatuses } from '@/shared/contracts';

import { getPermissionStatus } from '../permissionConfig';

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
