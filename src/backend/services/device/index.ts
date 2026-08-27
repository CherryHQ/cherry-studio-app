/**
 * Device capability adapters.
 *
 * These modules own the Expo and native calls and translate platform results
 * into portable JSON. They know nothing about Agents, tools, or approval:
 * `src/backend/ai/agent/tools/device` wraps them as Runtime tools, and
 * `DevicePermissions` owns the OS permission state they require.
 */

export {
  createCalendarEvent,
  createReminderItem,
  deleteCalendarEvent,
  deleteReminderItem,
  listCalendarCollections,
  listCalendarEvents,
  listReminderCollections,
  listReminderItems,
  updateCalendarEvent,
  updateReminderItem,
} from './calendar';
export type {
  CreateCalendarEventDetails,
  CreateReminderDetails,
  UpdateCalendarEventDetails,
  UpdateReminderDetails,
} from './calendar';
export { getHealthSummary, healthMetricNames, listHealthWorkouts } from './health';
export type { HealthKitLoader, HealthMetricName } from './health';
export { getCurrentLocation } from './location';
export { MAX_QUERY_RANGE_DAYS, NATIVE_TOOL_TIMEOUT_MS } from './utils';
