import { tool } from 'ai';
import * as z from 'zod';

import {
  createCalendarEvent,
  createReminderItem,
  deleteCalendarEvent,
  deleteReminderItem,
  listCalendarCollections,
  listCalendarEvents,
  listReminderCollections,
  listReminderItems,
  type UpdateCalendarEventDetails,
  type UpdateReminderDetails,
  updateCalendarEvent,
  updateReminderItem,
} from '../../../device/calendar';
import {
  createDeviceToolEntry,
  type DeviceToolDependencies,
  deviceToolErrorSchema,
  deviceToolModelOutput,
  runDeviceTool,
} from './deviceToolSupport';
import {
  calendarEventOutputSchema,
  collectionOutputSchema,
  mutationOutputSchema,
  reminderOutputSchema,
  updateOutputSchema,
} from './outputSchemas';
import { DEVICE_TOOL_NAMES } from './toolNames';

const id = z.string().min(1).max(512);
const idOrEmpty = z.string().max(512);
const isoDate = z.string().datetime({ offset: true });
const isoDateOrEmpty = z.union([z.literal(''), isoDate]);
const limit = (max: number) =>
  z
    .number()
    .int()
    .refine((value) => value === 0 || (value >= 1 && value <= max));
const text = (max: number) => z.string().max(max);
const emptyInput = z.object({}).strict();
const result = <T extends z.ZodType>(schema: T) => z.union([schema, deviceToolErrorSchema]);

const eventFields = [
  'allDay',
  'endDate',
  'location',
  'notes',
  'startDate',
  'timeZone',
  'title',
] as const;
const reminderFields = [
  'completed',
  'dueDate',
  'location',
  'notes',
  'startDate',
  'timeZone',
  'title',
] as const;

export function createCalendarToolEntries(deps: DeviceToolDependencies) {
  return [
    createDeviceToolEntry({
      deps,
      description: 'List device event calendar collections without attendees.',
      name: DEVICE_TOOL_NAMES.calendarListCollections,
      namespace: 'calendar',
      preferenceKeys: ['permissions.calendar_read'],
      tool: tool({
        description: 'List device event calendar collections without attendees.',
        inputSchema: emptyInput,
        outputSchema: result(z.array(collectionOutputSchema)),
        strict: true,
        execute: async (_input, options) => runDeviceTool(listCalendarCollections, options),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      deps,
      description: 'List calendar events in an ISO 8601 range of at most 90 days.',
      name: DEVICE_TOOL_NAMES.calendarListEvents,
      namespace: 'calendar',
      preferenceKeys: ['permissions.calendar_read'],
      tool: tool({
        description: 'List calendar events in an ISO 8601 range of at most 90 days.',
        inputSchema: z
          .object({
            calendarIds: z.array(id).max(50),
            endDate: isoDate,
            limit: limit(200),
            startDate: isoDate,
          })
          .strict(),
        outputSchema: result(z.array(calendarEventOutputSchema)),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(
            () =>
              listCalendarEvents({
                calendarIds: input.calendarIds.length ? input.calendarIds : undefined,
                endDate: input.endDate,
                limit: input.limit || 100,
                startDate: input.startDate,
              }),
            options,
          ),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      deps,
      description: 'Create an event in a writable device calendar without attendees.',
      name: DEVICE_TOOL_NAMES.calendarCreateEvent,
      namespace: 'calendar',
      preferenceKeys: ['permissions.calendar_write'],
      tool: tool({
        description: 'Create an event in a writable device calendar without attendees.',
        inputSchema: z
          .object({
            allDay: z.boolean(),
            calendarId: idOrEmpty,
            endDate: isoDate,
            location: text(1000),
            notes: text(4000),
            startDate: isoDate,
            timeZone: text(100),
            title: z.string().min(1).max(500),
          })
          .strict(),
        outputSchema: result(calendarEventOutputSchema),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(
            () =>
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
            options,
          ),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      deps,
      description: 'Update selected fields of an existing device calendar event.',
      name: DEVICE_TOOL_NAMES.calendarUpdateEvent,
      namespace: 'calendar',
      preferenceKeys: ['permissions.calendar_read', 'permissions.calendar_write'],
      tool: tool({
        description: 'Update selected fields of an existing device calendar event.',
        inputSchema: z
          .object({
            allDay: z.boolean(),
            endDate: isoDateOrEmpty,
            fields: z.array(z.enum(eventFields)).min(1).max(eventFields.length),
            id,
            location: text(1000),
            notes: text(4000),
            startDate: isoDateOrEmpty,
            timeZone: text(100),
            title: text(500),
          })
          .strict(),
        outputSchema: result(updateOutputSchema),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(() => updateCalendarEvent(normalizeEventUpdate(input)), options),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      deps,
      description: 'Delete an existing device calendar event.',
      name: DEVICE_TOOL_NAMES.calendarDeleteEvent,
      namespace: 'calendar',
      preferenceKeys: ['permissions.calendar_read', 'permissions.calendar_write'],
      tool: tool({
        description: 'Delete an existing device calendar event.',
        inputSchema: z.object({ id }).strict(),
        outputSchema: result(mutationOutputSchema),
        strict: true,
        execute: async ({ id }, options) => runDeviceTool(() => deleteCalendarEvent(id), options),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
  ];
}

export function createReminderToolEntries(deps: DeviceToolDependencies) {
  const common = { deps, namespace: 'reminder', platforms: ['ios'] as const };
  return [
    createDeviceToolEntry({
      ...common,
      description: 'List iOS reminder collections.',
      name: DEVICE_TOOL_NAMES.reminderListCollections,
      preferenceKeys: ['permissions.reminders_read'],
      tool: tool({
        description: 'List iOS reminder collections.',
        inputSchema: emptyInput,
        outputSchema: result(z.array(collectionOutputSchema)),
        strict: true,
        execute: async (_input, options) => runDeviceTool(listReminderCollections, options),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      ...common,
      description: 'List iOS reminders in an ISO 8601 range of at most 90 days.',
      name: DEVICE_TOOL_NAMES.reminderListItems,
      preferenceKeys: ['permissions.reminders_read'],
      tool: tool({
        description: 'List iOS reminders in an ISO 8601 range of at most 90 days.',
        inputSchema: z
          .object({
            endDate: isoDate,
            limit: limit(200),
            listIds: z.array(id).max(50),
            startDate: isoDate,
            status: z.enum(['all', 'completed', 'incomplete']),
          })
          .strict(),
        outputSchema: result(z.array(reminderOutputSchema)),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(
            () =>
              listReminderItems({
                ...input,
                limit: input.limit || 100,
                listIds: input.listIds.length ? input.listIds : undefined,
              }),
            options,
          ),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      ...common,
      description: 'Create an item in a writable iOS reminder collection.',
      name: DEVICE_TOOL_NAMES.reminderCreateItem,
      preferenceKeys: ['permissions.reminders_write'],
      tool: tool({
        description: 'Create an item in a writable iOS reminder collection.',
        inputSchema: z
          .object({
            completed: z.boolean(),
            dueDate: isoDateOrEmpty,
            listId: idOrEmpty,
            location: text(1000),
            notes: text(4000),
            startDate: isoDateOrEmpty,
            timeZone: text(100),
            title: z.string().min(1).max(500),
          })
          .strict(),
        outputSchema: result(reminderOutputSchema),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(
            () =>
              createReminderItem({
                completed: input.completed,
                dueDate: input.dueDate || undefined,
                listId: input.listId || undefined,
                location: input.location || undefined,
                notes: input.notes || undefined,
                startDate: input.startDate || undefined,
                timeZone: input.timeZone || undefined,
                title: input.title,
              }),
            options,
          ),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      ...common,
      description: 'Update selected fields of an existing iOS reminder.',
      name: DEVICE_TOOL_NAMES.reminderUpdateItem,
      preferenceKeys: ['permissions.reminders_read', 'permissions.reminders_write'],
      tool: tool({
        description: 'Update selected fields of an existing iOS reminder.',
        inputSchema: z
          .object({
            completed: z.boolean(),
            dueDate: isoDateOrEmpty,
            fields: z.array(z.enum(reminderFields)).min(1).max(reminderFields.length),
            id,
            location: text(1000),
            notes: text(4000),
            startDate: isoDateOrEmpty,
            timeZone: text(100),
            title: text(500),
          })
          .strict(),
        outputSchema: result(updateOutputSchema),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(() => updateReminderItem(normalizeReminderUpdate(input)), options),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      ...common,
      description: 'Delete an existing iOS reminder.',
      name: DEVICE_TOOL_NAMES.reminderDeleteItem,
      preferenceKeys: ['permissions.reminders_read', 'permissions.reminders_write'],
      tool: tool({
        description: 'Delete an existing iOS reminder.',
        inputSchema: z.object({ id }).strict(),
        outputSchema: result(mutationOutputSchema),
        strict: true,
        execute: async ({ id }, options) => runDeviceTool(() => deleteReminderItem(id), options),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
  ];
}

function normalizeEventUpdate(input: {
  allDay: boolean;
  endDate: string;
  fields: (typeof eventFields)[number][];
  id: string;
  location: string;
  notes: string;
  startDate: string;
  timeZone: string;
  title: string;
}): UpdateCalendarEventDetails & { id: string } {
  const output: UpdateCalendarEventDetails & { id: string } = { id: input.id };
  for (const field of input.fields) {
    if (field === 'allDay') output.allDay = input.allDay;
    else if (field === 'title') {
      if (!input.title.trim()) throw new Error('title cannot be empty when selected');
      output.title = input.title;
    } else if (field === 'startDate' || field === 'endDate') {
      const value = input[field];
      if (!value) throw new Error(`${field} cannot be empty when selected`);
      output[field] = value;
    } else output[field] = input[field] || null;
  }
  return output;
}

function normalizeReminderUpdate(input: {
  completed: boolean;
  dueDate: string;
  fields: (typeof reminderFields)[number][];
  id: string;
  location: string;
  notes: string;
  startDate: string;
  timeZone: string;
  title: string;
}): UpdateReminderDetails & { id: string } {
  const output: UpdateReminderDetails & { id: string } = { id: input.id };
  for (const field of input.fields) {
    if (field === 'completed') output.completed = input.completed;
    else if (field === 'title') {
      if (!input.title.trim()) throw new Error('title cannot be empty when selected');
      output.title = input.title;
    } else output[field] = input[field] || null;
  }
  return output;
}
