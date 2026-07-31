import { usePreference } from '@/frontend/data/hooks';

export function usePermissionPolicies() {
  const [calendarRead] = usePreference('permissions.calendar_read');
  const [calendarWrite] = usePreference('permissions.calendar_write');
  const [healthRead] = usePreference('permissions.health_read');
  const [locationRead] = usePreference('permissions.location_read');
  const [remindersRead] = usePreference('permissions.reminders_read');
  const [remindersWrite] = usePreference('permissions.reminders_write');

  return {
    'permissions.calendar_read': calendarRead,
    'permissions.calendar_write': calendarWrite,
    'permissions.health_read': healthRead,
    'permissions.location_read': locationRead,
    'permissions.reminders_read': remindersRead,
    'permissions.reminders_write': remindersWrite,
  };
}
