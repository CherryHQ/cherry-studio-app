import { useAppPreference } from '@/data/hooks';

export function usePermissionPolicies() {
  const [calendarRead] = useAppPreference('permissions.calendar_read');
  const [calendarWrite] = useAppPreference('permissions.calendar_write');
  const [healthRead] = useAppPreference('permissions.health_read');
  const [locationRead] = useAppPreference('permissions.location_read');
  const [remindersRead] = useAppPreference('permissions.reminders_read');
  const [remindersWrite] = useAppPreference('permissions.reminders_write');

  return {
    'permissions.calendar_read': calendarRead,
    'permissions.calendar_write': calendarWrite,
    'permissions.health_read': healthRead,
    'permissions.location_read': locationRead,
    'permissions.reminders_read': remindersRead,
    'permissions.reminders_write': remindersWrite,
  };
}
