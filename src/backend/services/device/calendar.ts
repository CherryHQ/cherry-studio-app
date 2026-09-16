import * as Calendar from 'expo-calendar';
import * as CalendarForm from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import { parseDateRange, toIso, withNativeToolTimeout } from './utils';

export type CreateCalendarEventDetails = {
  allDay?: boolean;
  endDate?: string;
  location?: string;
  notes?: string;
  startDate?: string;
  timeZone?: string;
  title?: string;
};

export type UpdateCalendarEventDetails = Omit<
  CreateCalendarEventDetails,
  'location' | 'notes' | 'timeZone'
> & {
  location?: string | null;
  notes?: string | null;
  timeZone?: string | null;
};

export type CreateReminderDetails = {
  completed?: boolean;
  dueDate?: string;
  location?: string;
  notes?: string;
  startDate?: string;
  timeZone?: string;
  title?: string;
};

export type UpdateReminderDetails = Omit<
  CreateReminderDetails,
  'dueDate' | 'location' | 'notes' | 'startDate' | 'timeZone'
> & {
  dueDate?: string | null;
  location?: string | null;
  notes?: string | null;
  startDate?: string | null;
  timeZone?: string | null;
};

export async function listCalendarCollections() {
  return (await getEventCalendars()).map(serializeCalendar);
}

export async function listCalendarEvents(input: {
  calendarIds?: string[];
  endDate: string;
  limit?: number;
  startDate: string;
}) {
  const range = parseDateRange(input.startDate, input.endDate);
  const ids = input.calendarIds?.length
    ? input.calendarIds
    : (await getEventCalendars()).map(({ id }) => id);
  const events = await withNativeToolTimeout(
    Calendar.listEvents(ids, range.start, range.end),
    'Calendar event query',
  );
  return events.slice(0, input.limit ?? 100).map(serializeEvent);
}

export async function createCalendarEvent(
  input: CreateCalendarEventDetails & {
    calendarId?: string;
    endDate: string;
    startDate: string;
    title: string;
  },
  signal?: AbortSignal,
) {
  const { calendarId, endDate, startDate, ...details } = input;
  const range = parseDateRange(startDate, endDate);
  const eventDetails = { ...details, endDate: range.end, startDate: range.start };
  let hasWriteStarted = false;
  try {
    throwIfCalendarCancelled(signal);
    const calendar = calendarId
      ? await withNativeToolTimeout(Calendar.ExpoCalendar.get(calendarId), 'Calendar lookup')
      : await getDefaultWritableCalendar(Calendar.EntityTypes.EVENT);
    assertWritable(calendar);
    throwIfCalendarCancelled(signal);
    hasWriteStarted = true;
    const event = await withNativeToolTimeout(
      calendar.createEvent(eventDetails),
      'Calendar event creation',
    );
    return serializeEvent(event);
  } catch (error) {
    throwIfCalendarCancelled(signal, error);
    if (Platform.OS !== 'android') throw error;
    // Expo inserts before constructing its returned event. Even a rejected call
    // can have written a row; a timeout also leaves the native operation running.
    if (hasWriteStarted) return uncertainCalendarWrite(error);
    return {
      ...(await openCalendarForm(
        () => CalendarForm.createEventInCalendarAsync(eventDetails, { startNewActivityTask: true }),
        error,
        'The system calendar creation form was opened. Ask the user to check the details, select the intended calendar, and save. Saving is not confirmed; do not report the event as created or retry automatically.',
        signal,
      )),
      requestedCalendarId: calendarId ?? null,
    };
  }
}

export async function updateCalendarEvent(
  input: UpdateCalendarEventDetails & { id: string },
  signal?: AbortSignal,
) {
  const { id, ...details } = input;
  if (details.startDate && details.endDate) parseDateRange(details.startDate, details.endDate);
  let isWritePending = false;
  try {
    throwIfCalendarCancelled(signal);
    const event = await withNativeToolTimeout(
      Calendar.ExpoCalendarEvent.get(id),
      'Calendar event lookup',
    );
    throwIfCalendarCancelled(signal);
    const update = {
      ...details,
      ...(details.endDate !== undefined && { endDate: new Date(details.endDate) }),
      ...(details.startDate !== undefined && { startDate: new Date(details.startDate) }),
    } as Parameters<typeof event.update>[0];
    // A timed-out write must not race with the user's edits in the calendar app.
    const operation = event.update(update);
    isWritePending = true;
    await withNativeToolTimeout(
      operation.finally(() => {
        isWritePending = false;
      }),
      'Calendar event update',
    );
    return { id, updated: true as const };
  } catch (error) {
    throwIfCalendarCancelled(signal, error);
    if (Platform.OS !== 'android') throw error;
    if (isWritePending) return { ...uncertainCalendarWrite(error), id };
    return {
      ...(await openCalendarForm(
        () => CalendarForm.editEventInCalendarAsync({ id }, { startNewActivityTask: true }),
        error,
        'The existing event was opened in the system calendar. Ask the user to check its current values and manually apply any remaining requested changes. The changes are not prefilled and saving is not confirmed; do not report success or retry automatically.',
        signal,
      )),
      id,
      requestedChanges: details,
    };
  }
}

function throwIfCalendarCancelled(signal?: AbortSignal, error?: unknown) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : Object.assign(new Error('Calendar request cancelled'), { name: 'AbortError' });
  }
  if (error instanceof Error && error.name === 'AbortError') throw error;
}

function uncertainCalendarWrite(error: unknown) {
  return {
    status: 'error' as const,
    outcome: 'unknown' as const,
    retryable: false,
    error: error instanceof Error ? error.message : String(error),
    message:
      'The calendar write may have completed or may still be running. Ask the user to check the system calendar before making further changes. Do not retry automatically or open a new creation form, as that could duplicate an event.',
  };
}

async function openCalendarForm(
  open: () => Promise<unknown>,
  error: unknown,
  message: string,
  signal?: AbortSignal,
) {
  const reason = error instanceof Error ? error.message : String(error);
  try {
    // A new Android task reports `done` on launch, before the user edits or saves.
    await open();
    throwIfCalendarCancelled(signal);
    return {
      status: 'requires_user_action' as const,
      fallback: 'system_calendar' as const,
      saveConfirmed: false,
      retryable: false,
      error: reason,
      message,
    };
  } catch (formError) {
    throwIfCalendarCancelled(signal, formError);
    return {
      status: 'error' as const,
      retryable: false,
      error: reason,
      fallbackError: formError instanceof Error ? formError.message : String(formError),
      message:
        'The system calendar form could not be opened. Tell the user to check or change the event in their calendar app manually; do not retry automatically.',
    };
  }
}

export async function deleteCalendarEvent(id: string) {
  const event = await withNativeToolTimeout(
    Calendar.ExpoCalendarEvent.get(id),
    'Calendar event lookup',
  );
  await withNativeToolTimeout(event.delete(), 'Calendar event deletion');
  return { deleted: true as const, id };
}

export async function listReminderCollections() {
  return (await getReminderCalendars()).map(serializeCalendar);
}

export async function listReminderItems(input: {
  endDate: string;
  limit?: number;
  listIds?: string[];
  startDate: string;
  status: 'all' | 'completed' | 'incomplete';
}) {
  const range = parseDateRange(input.startDate, input.endDate);
  const calendars = input.listIds?.length
    ? await Promise.all(
        input.listIds.map((id) =>
          withNativeToolTimeout(Calendar.ExpoCalendar.get(id), 'Reminder list lookup'),
        ),
      )
    : await getReminderCalendars();
  const status =
    input.status === 'completed'
      ? Calendar.ReminderStatus.COMPLETED
      : input.status === 'incomplete'
        ? Calendar.ReminderStatus.INCOMPLETE
        : null;
  const batches = await Promise.all(
    calendars.map((calendar) =>
      withNativeToolTimeout(
        calendar.listReminders(range.start, range.end, status),
        'Reminder query',
      ),
    ),
  );
  return batches
    .flat()
    .slice(0, input.limit ?? 100)
    .map(serializeReminder);
}

export async function createReminderItem(
  input: CreateReminderDetails & { listId?: string; title: string },
) {
  const { dueDate, listId, startDate, ...details } = input;
  const calendar = listId
    ? await withNativeToolTimeout(Calendar.ExpoCalendar.get(listId), 'Reminder list lookup')
    : await getDefaultWritableCalendar(Calendar.EntityTypes.REMINDER);
  assertWritable(calendar);
  const reminder = await withNativeToolTimeout(
    calendar.createReminder({
      ...details,
      ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
    }),
    'Reminder creation',
  );
  return serializeReminder(reminder);
}

export async function updateReminderItem(input: UpdateReminderDetails & { id: string }) {
  const { dueDate, id, startDate, ...details } = input;
  const reminder = await withNativeToolTimeout(
    Calendar.ExpoCalendarReminder.get(id),
    'Reminder lookup',
  );
  await withNativeToolTimeout(
    reminder.update({
      ...details,
      ...(dueDate !== undefined && { dueDate: dueDate === null ? null : new Date(dueDate) }),
      ...(startDate !== undefined && {
        startDate: startDate === null ? null : new Date(startDate),
      }),
    } as Parameters<typeof reminder.update>[0]),
    'Reminder update',
  );
  return { id, updated: true as const };
}

export async function deleteReminderItem(id: string) {
  const reminder = await withNativeToolTimeout(
    Calendar.ExpoCalendarReminder.get(id),
    'Reminder lookup',
  );
  await withNativeToolTimeout(reminder.delete(), 'Reminder deletion');
  return { deleted: true as const, id };
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
    if (defaultCalendar.allowsModifications) return defaultCalendar;
  }
  const calendars = await withNativeToolTimeout(
    Calendar.getCalendars(entityType),
    'Writable calendar lookup',
  );
  const calendar =
    calendars.find((candidate) => candidate.allowsModifications && candidate.isPrimary) ??
    calendars.find((candidate) => candidate.allowsModifications);
  if (!calendar) throw new Error('No writable calendar is available');
  return calendar;
}

function assertWritable(calendar: Calendar.ExpoCalendar) {
  if (!calendar.allowsModifications) throw new Error(`Calendar ${calendar.title} is read-only`);
}

function serializeCalendar(calendar: Calendar.ExpoCalendar) {
  return {
    accessLevel: calendar.accessLevel ?? null,
    allowsModifications: calendar.allowsModifications,
    color: calendar.color ?? null,
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
    allDay: event.allDay ?? false,
    availability: event.availability ?? null,
    calendarId: event.calendarId,
    endDate: toIso(event.endDate) ?? null,
    id: event.id,
    location: event.location ?? null,
    notes: event.notes ?? null,
    startDate: toIso(event.startDate) ?? null,
    status: event.status ?? null,
    timeZone: event.timeZone ?? null,
    title: event.title ?? '',
    url: event.url ?? null,
  };
}

function serializeReminder(reminder: Calendar.ExpoCalendarReminder) {
  return {
    calendarId: reminder.calendarId ?? '',
    completed: reminder.completed ?? false,
    completionDate: toIso(reminder.completionDate) ?? null,
    dueDate: toIso(reminder.dueDate) ?? null,
    id: reminder.id ?? '',
    location: reminder.location ?? null,
    notes: reminder.notes ?? null,
    startDate: toIso(reminder.startDate) ?? null,
    timeZone: reminder.timeZone ?? null,
    title: reminder.title ?? '',
    url: reminder.url ?? null,
  };
}
