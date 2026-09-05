/**
 * System calendar capabilities.
 *
 * Reads and mutations stay separate so application policy can approve safe
 * lookups automatically while asking before calendar changes.
 */

import * as z from 'zod';

import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarCollections,
  listCalendarEvents,
  type UpdateCalendarEventDetails,
  updateCalendarEvent,
} from '@/backend/services/device';

import { createDeviceRuntimeTool, type DeviceToolDependencies } from './deviceRuntimeTool';
import {
  DEFAULT_COLLECTION_LIMIT,
  EMPTY_INPUT_SCHEMA,
  entityId,
  optionalEntityId,
  isoDate,
  optionalIsoDate,
  limit,
  text,
} from './deviceToolSchemas';

export const CALENDAR_TOOL_IDS = {
  createEvent: 'calendar_create_event',
  deleteEvent: 'calendar_delete_event',
  listCollections: 'calendar_list_collections',
  listEvents: 'calendar_list_events',
  updateEvent: 'calendar_update_event',
} as const;

const EVENT_FIELDS = [
  'allDay',
  'endDate',
  'location',
  'notes',
  'startDate',
  'timeZone',
  'title',
] as const;

const listEventsSchema = z
  .object({
    calendarIds: z.array(entityId).max(50),
    endDate: isoDate,
    limit: limit(200),
    startDate: isoDate,
  })
  .strict();

const createEventSchema = z
  .object({
    allDay: z.boolean(),
    calendarId: optionalEntityId,
    endDate: isoDate,
    location: text(1000),
    notes: text(4000),
    startDate: isoDate,
    timeZone: text(100),
    title: z.string().min(1).max(500),
  })
  .strict();

const updateEventSchema = z
  .object({
    allDay: z.boolean(),
    endDate: optionalIsoDate,
    fields: z.array(z.enum(EVENT_FIELDS)).min(1).max(EVENT_FIELDS.length),
    id: entityId,
    location: text(1000),
    notes: text(4000),
    startDate: optionalIsoDate,
    timeZone: text(100),
    title: text(500),
  })
  .strict();

const deleteEventSchema = z.object({ id: entityId }).strict();

export function createCalendarTools(deps: DeviceToolDependencies) {
  return [
    createDeviceRuntimeTool({
      capabilityId: CALENDAR_TOOL_IDS.listCollections,
      deps,
      description: 'List device event calendar collections without attendees.',
      displayName: 'List calendars',
      inputSchema: EMPTY_INPUT_SCHEMA,
      permissionScopes: ['calendar.read'],
      run: () => listCalendarCollections(),
    }),
    createDeviceRuntimeTool({
      capabilityId: CALENDAR_TOOL_IDS.listEvents,
      deps,
      description: 'List calendar events in an ISO 8601 range of at most 90 days.',
      displayName: 'List calendar events',
      inputSchema: listEventsSchema,
      permissionScopes: ['calendar.read'],
      run: (input) =>
        listCalendarEvents({
          calendarIds: input.calendarIds.length > 0 ? input.calendarIds : undefined,
          endDate: input.endDate,
          limit: input.limit || DEFAULT_COLLECTION_LIMIT,
          startDate: input.startDate,
        }),
    }),
    createDeviceRuntimeTool({
      capabilityId: CALENDAR_TOOL_IDS.createEvent,
      deps,
      description: 'Create an event in a writable device calendar without attendees.',
      displayName: 'Create calendar event',
      inputSchema: createEventSchema,
      permissionScopes: ['calendar.write'],
      run: (input) =>
        createCalendarEvent({
          allDay: input.allDay,
          calendarId: input.calendarId || undefined,
          endDate: input.endDate,
          location: input.location || undefined,
          notes: input.notes || undefined,
          startDate: input.startDate,
          timeZone: input.timeZone || undefined,
          title: input.title,
        }),
    }),
    createDeviceRuntimeTool({
      capabilityId: CALENDAR_TOOL_IDS.updateEvent,
      deps,
      description: 'Update selected fields of an existing device calendar event.',
      displayName: 'Update calendar event',
      inputSchema: updateEventSchema,
      permissionScopes: ['calendar.read', 'calendar.write'],
      run: (input) => updateCalendarEvent(toEventUpdate(input)),
    }),
    createDeviceRuntimeTool({
      capabilityId: CALENDAR_TOOL_IDS.deleteEvent,
      deps,
      description: 'Delete an existing device calendar event.',
      displayName: 'Delete calendar event',
      inputSchema: deleteEventSchema,
      permissionScopes: ['calendar.read', 'calendar.write'],
      run: (input) => deleteCalendarEvent(input.id),
    }),
  ];
}

/**
 * `fields` is the model's explicit "change exactly these" list, so an unlisted
 * property is left alone rather than cleared, and a listed-but-empty optional
 * clears deliberately.
 */
function toEventUpdate(
  input: z.output<typeof updateEventSchema>,
): UpdateCalendarEventDetails & { id: string } {
  const update: UpdateCalendarEventDetails & { id: string } = { id: input.id };
  for (const field of input.fields) {
    if (field === 'allDay') {
      update.allDay = input.allDay;
    } else if (field === 'title') {
      if (!input.title.trim()) {
        throw new Error('title cannot be empty when it is selected for update');
      }
      update.title = input.title;
    } else if (field === 'startDate' || field === 'endDate') {
      const value = input[field];
      if (!value) {
        throw new Error(`${field} cannot be empty when it is selected for update`);
      }
      update[field] = value;
    } else {
      update[field] = input[field] || null;
    }
  }
  return update;
}
