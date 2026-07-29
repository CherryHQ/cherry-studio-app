import { type ToolSet, tool } from 'ai';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import * as z from 'zod';

import { parseDateRange, toIso, withNativeToolTimeout } from './toolUtils';

const isoDate = z.string().datetime({ offset: true });
const idSchema = z.string().min(1).max(512);
const optionalText = z.string().max(4000).optional();
const eventFields = {
  allDay: z.boolean().optional(),
  endDate: isoDate.optional(),
  location: z.string().max(1000).optional(),
  notes: optionalText,
  startDate: isoDate.optional(),
  timeZone: z.string().max(100).optional(),
  title: z.string().min(1).max(500).optional(),
};

const listEventsInput = z
  .object({
    calendarIds: z.array(idSchema).max(50).optional(),
    endDate: isoDate,
    limit: z.number().int().min(1).max(200).default(100),
    startDate: isoDate,
  })
  .strict();
const createEventInput = z
  .object({
    ...eventFields,
    calendarId: idSchema.optional(),
    endDate: isoDate,
    startDate: isoDate,
    title: z.string().min(1).max(500),
  })
  .strict();
const updateEventInput = z
  .object({ id: idSchema, ...eventFields })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'id'), {
    message: 'At least one event field must be provided',
  });
const deleteEventInput = z.object({ id: idSchema }).strict();

export function createCalendarReadTools(): ToolSet {
  return {
    builtin_list_calendars: tool({
      description: 'List the device event calendars without attendees.',
      inputSchema: z.object({}).strict(),
      strict: true,
      execute: async () => {
        const calendars = await getEventCalendars();
        return calendars.map(serializeCalendar);
      },
    }),
    builtin_list_calendar_events: tool({
      description: 'List calendar events in an ISO 8601 date range of at most 90 days.',
      inputSchema: listEventsInput,
      strict: true,
      execute: async ({ calendarIds, endDate, limit, startDate }) => {
        const range = parseDateRange(startDate, endDate);
        const ids = calendarIds?.length
          ? calendarIds
          : (await getEventCalendars()).map(({ id }) => id);
        const events = await withNativeToolTimeout(
          Calendar.listEvents(ids, range.start, range.end),
          'Calendar event query',
        );
        return events.slice(0, limit).map(serializeEvent);
      },
    }),
  };
}

export function createCalendarCreateTools(): ToolSet {
  return {
    builtin_create_calendar_event: tool({
      description: 'Create an event in a writable device calendar without managing attendees.',
      inputSchema: createEventInput,
      strict: true,
      execute: async ({ calendarId, endDate, startDate, ...details }) => {
        const range = parseDateRange(startDate, endDate);
        const calendar = calendarId
          ? await withNativeToolTimeout(Calendar.ExpoCalendar.get(calendarId), 'Calendar lookup')
          : await getDefaultWritableCalendar(Calendar.EntityTypes.EVENT);
        assertWritable(calendar);
        const event = await withNativeToolTimeout(
          calendar.createEvent({ ...details, endDate: range.end, startDate: range.start }),
          'Calendar event creation',
        );
        return serializeEvent(event);
      },
    }),
  };
}

export function createCalendarModifyTools(): ToolSet {
  return {
    builtin_update_calendar_event: tool({
      description: 'Update an existing device calendar event without changing attendees.',
      inputSchema: updateEventInput,
      strict: true,
      execute: async ({ id, ...details }) => {
        if (details.startDate && details.endDate) {
          parseDateRange(details.startDate, details.endDate);
        }
        const event = await withNativeToolTimeout(
          Calendar.ExpoCalendarEvent.get(id),
          'Calendar event lookup',
        );
        await withNativeToolTimeout(
          event.update({
            ...details,
            endDate: details.endDate ? new Date(details.endDate) : undefined,
            startDate: details.startDate ? new Date(details.startDate) : undefined,
          }),
          'Calendar event update',
        );
        return { id, updated: true };
      },
    }),
    builtin_delete_calendar_event: tool({
      description: 'Delete an existing device calendar event.',
      inputSchema: deleteEventInput,
      strict: true,
      execute: async ({ id }) => {
        const event = await withNativeToolTimeout(
          Calendar.ExpoCalendarEvent.get(id),
          'Calendar event lookup',
        );
        await withNativeToolTimeout(event.delete(), 'Calendar event deletion');
        return { deleted: true, id };
      },
    }),
  };
}

export function createReminderReadTools(): ToolSet {
  if (Platform.OS !== 'ios') {
    return {};
  }

  return {
    builtin_list_reminder_lists: tool({
      description: 'List iOS reminder lists.',
      inputSchema: z.object({}).strict(),
      strict: true,
      execute: async () => {
        const calendars = await getReminderCalendars();
        return calendars.map(serializeCalendar);
      },
    }),
    builtin_list_reminders: tool({
      description: 'List iOS reminders in an ISO 8601 date range of at most 90 days.',
      inputSchema: z
        .object({
          endDate: isoDate,
          limit: z.number().int().min(1).max(200).default(100),
          listIds: z.array(idSchema).max(50).optional(),
          startDate: isoDate,
          status: z.enum(['all', 'completed', 'incomplete']).default('all'),
        })
        .strict(),
      strict: true,
      execute: async ({ endDate, limit, listIds, startDate, status }) => {
        const range = parseDateRange(startDate, endDate);
        const calendars = listIds?.length
          ? await Promise.all(
              listIds.map((id) =>
                withNativeToolTimeout(Calendar.ExpoCalendar.get(id), 'Reminder list lookup'),
              ),
            )
          : await getReminderCalendars();
        const reminderStatus =
          status === 'completed'
            ? Calendar.ReminderStatus.COMPLETED
            : status === 'incomplete'
              ? Calendar.ReminderStatus.INCOMPLETE
              : null;
        const batches = await Promise.all(
          calendars.map((calendar) =>
            withNativeToolTimeout(
              calendar.listReminders(range.start, range.end, reminderStatus),
              'Reminder query',
            ),
          ),
        );
        return batches.flat().slice(0, limit).map(serializeReminder);
      },
    }),
  };
}

const reminderFields = {
  completed: z.boolean().optional(),
  dueDate: isoDate.optional(),
  location: z.string().max(1000).optional(),
  notes: optionalText,
  startDate: isoDate.optional(),
  timeZone: z.string().max(100).optional(),
  title: z.string().min(1).max(500).optional(),
};

export function createReminderWriteTools(): ToolSet {
  if (Platform.OS !== 'ios') {
    return {};
  }

  return {
    builtin_create_reminder: tool({
      description: 'Create an iOS reminder in a writable reminder list.',
      inputSchema: z
        .object({
          ...reminderFields,
          listId: idSchema.optional(),
          title: z.string().min(1).max(500),
        })
        .strict(),
      strict: true,
      execute: async ({ dueDate, listId, startDate, ...details }) => {
        const calendar = listId
          ? await withNativeToolTimeout(Calendar.ExpoCalendar.get(listId), 'Reminder list lookup')
          : await getDefaultWritableCalendar(Calendar.EntityTypes.REMINDER);
        assertWritable(calendar);
        const reminder = await withNativeToolTimeout(
          calendar.createReminder({
            ...details,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            startDate: startDate ? new Date(startDate) : undefined,
          }),
          'Reminder creation',
        );
        return serializeReminder(reminder);
      },
    }),
    builtin_update_reminder: tool({
      description: 'Update an existing iOS reminder.',
      inputSchema: z
        .object({ id: idSchema, ...reminderFields })
        .strict()
        .refine((value) => Object.keys(value).some((key) => key !== 'id'), {
          message: 'At least one reminder field must be provided',
        }),
      strict: true,
      execute: async ({ dueDate, id, startDate, ...details }) => {
        const reminder = await withNativeToolTimeout(
          Calendar.ExpoCalendarReminder.get(id),
          'Reminder lookup',
        );
        await withNativeToolTimeout(
          reminder.update({
            ...details,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            startDate: startDate ? new Date(startDate) : undefined,
          }),
          'Reminder update',
        );
        return { id, updated: true };
      },
    }),
    builtin_delete_reminder: tool({
      description: 'Delete an existing iOS reminder.',
      inputSchema: deleteEventInput,
      strict: true,
      execute: async ({ id }) => {
        const reminder = await withNativeToolTimeout(
          Calendar.ExpoCalendarReminder.get(id),
          'Reminder lookup',
        );
        await withNativeToolTimeout(reminder.delete(), 'Reminder deletion');
        return { deleted: true, id };
      },
    }),
  };
}

async function getEventCalendars() {
  return withNativeToolTimeout(
    Calendar.getCalendars(Calendar.EntityTypes.EVENT),
    'Calendar list query',
  );
}

async function getReminderCalendars() {
  return withNativeToolTimeout(
    Calendar.getCalendars(Calendar.EntityTypes.REMINDER),
    'Reminder list query',
  );
}

async function getDefaultWritableCalendar(entityType: Calendar.EntityTypes) {
  if (Platform.OS === 'ios' && entityType === Calendar.EntityTypes.EVENT) {
    const defaultCalendar = Calendar.getDefaultCalendarSync();
    if (defaultCalendar.allowsModifications) {
      return defaultCalendar;
    }
  }

  const calendars = await withNativeToolTimeout(
    Calendar.getCalendars(entityType),
    'Writable calendar lookup',
  );
  const calendar =
    calendars.find((candidate) => candidate.allowsModifications && candidate.isPrimary) ??
    calendars.find((candidate) => candidate.allowsModifications);
  if (!calendar) {
    throw new Error('No writable calendar is available');
  }
  return calendar;
}

function assertWritable(calendar: Calendar.ExpoCalendar) {
  if (!calendar.allowsModifications) {
    throw new Error(`Calendar ${calendar.title} is read-only`);
  }
}

function serializeCalendar(calendar: Calendar.ExpoCalendar) {
  return {
    accessLevel: calendar.accessLevel ?? null,
    allowsModifications: calendar.allowsModifications,
    color: calendar.color,
    entityType: calendar.entityType ?? null,
    id: calendar.id,
    isPrimary: calendar.isPrimary ?? null,
    isVisible: calendar.isVisible ?? null,
    ownerAccount: calendar.ownerAccount ?? null,
    source: calendar.source
      ? { name: calendar.source.name ?? null, type: calendar.source.type ?? null }
      : null,
    title: calendar.title,
  };
}

function serializeEvent(event: Calendar.ExpoCalendarEvent) {
  return {
    allDay: event.allDay,
    availability: event.availability ?? null,
    calendarId: event.calendarId,
    endDate: toIso(event.endDate),
    id: event.id,
    location: event.location ?? null,
    notes: event.notes ?? null,
    startDate: toIso(event.startDate),
    status: event.status ?? null,
    timeZone: event.timeZone ?? null,
    title: event.title,
    url: event.url ?? null,
  };
}

function serializeReminder(reminder: Calendar.ExpoCalendarReminder) {
  return {
    calendarId: reminder.calendarId,
    completed: reminder.completed,
    completionDate: toIso(reminder.completionDate) ?? null,
    dueDate: toIso(reminder.dueDate) ?? null,
    id: reminder.id,
    location: reminder.location ?? null,
    notes: reminder.notes ?? null,
    startDate: toIso(reminder.startDate) ?? null,
    timeZone: reminder.timeZone ?? null,
    title: reminder.title,
    url: reminder.url ?? null,
  };
}
