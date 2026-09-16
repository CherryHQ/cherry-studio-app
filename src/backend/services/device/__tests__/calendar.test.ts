import * as Calendar from 'expo-calendar';
import * as CalendarForm from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import { createCalendarEvent, updateCalendarEvent } from '../calendar';
import { NATIVE_TOOL_TIMEOUT_MS } from '../utils';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-calendar', () => ({
  EntityTypes: { EVENT: 'event' },
  ExpoCalendar: { get: jest.fn() },
  ExpoCalendarEvent: { get: jest.fn() },
  getCalendars: jest.fn(),
}));
jest.mock('expo-calendar/legacy', () => ({
  createEventInCalendarAsync: jest.fn(),
  editEventInCalendarAsync: jest.fn(),
}));

const input = {
  calendarId: '1',
  title: 'Meeting',
  startDate: '2026-09-16T10:00:00+08:00',
  endDate: '2026-09-16T11:00:00+08:00',
  notes: 'Agenda',
};
const updateEvent = jest.fn<Promise<void>, [unknown]>();
const createEvent = jest.fn<Promise<Calendar.ExpoCalendarEvent>, [unknown]>();
const calendar = {
  id: '1',
  allowsModifications: true,
  createEvent,
} as unknown as Calendar.ExpoCalendar;
const event = {
  ...input,
  id: '2',
  startDate: new Date(input.startDate),
  endDate: new Date(input.endDate),
  update: updateEvent,
} as unknown as Calendar.ExpoCalendarEvent;
const dialogResult = { action: 'done', id: null } as CalendarForm.DialogEventResult;

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(Calendar.ExpoCalendar.get).mockResolvedValue(calendar);
  jest.mocked(Calendar.getCalendars).mockResolvedValue([calendar]);
  jest.mocked(Calendar.ExpoCalendarEvent.get).mockResolvedValue(event);
  createEvent.mockResolvedValue(event);
  updateEvent.mockResolvedValue(undefined);
  jest.mocked(CalendarForm.createEventInCalendarAsync).mockResolvedValue(dialogResult);
  jest.mocked(CalendarForm.editEventInCalendarAsync).mockResolvedValue(dialogResult);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('successful direct writes keep their confirmed results without opening a form', async () => {
  await expect(createCalendarEvent(input)).resolves.toMatchObject({
    id: '2',
    calendarId: '1',
    startDate: '2026-09-16T02:00:00.000Z',
  });
  await expect(updateCalendarEvent({ id: '2', title: 'Changed' })).resolves.toEqual({
    id: '2',
    updated: true,
  });
  expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
  expect(CalendarForm.editEventInCalendarAsync).not.toHaveBeenCalled();
});

test('a lookup failure opens a prefilled creation form without claiming it saved', async () => {
  jest.mocked(Calendar.ExpoCalendar.get).mockRejectedValue(new Error('Invalid native result'));
  const result = await createCalendarEvent(input);
  expect(result).toMatchObject({
    status: 'requires_user_action',
    saveConfirmed: false,
    retryable: false,
    requestedCalendarId: '1',
    error: 'Invalid native result',
  });
  expect(CalendarForm.createEventInCalendarAsync).toHaveBeenCalledWith(
    {
      title: input.title,
      notes: input.notes,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
    },
    { startNewActivityTask: true },
  );
  expect(createEvent).not.toHaveBeenCalled();
  expect(result).not.toHaveProperty('id');
});

test('no writable calendars falls back to user selection in the system form', async () => {
  jest.mocked(Calendar.getCalendars).mockResolvedValue([]);
  await expect(createCalendarEvent({ ...input, calendarId: undefined })).resolves.toMatchObject({
    status: 'requires_user_action',
    requestedCalendarId: null,
  });
  expect(createEvent).not.toHaveBeenCalled();
});

test('a rejected creation may already have inserted an event and must not open another form', async () => {
  createEvent.mockRejectedValue(new Error('Failed to construct native return value'));
  await expect(createCalendarEvent(input)).resolves.toMatchObject({
    status: 'error',
    outcome: 'unknown',
    retryable: false,
    error: 'Failed to construct native return value',
  });
  expect(createEvent).toHaveBeenCalledTimes(1);
  expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
});

test('a failure serializing an inserted event must not open a second creation form', async () => {
  createEvent.mockResolvedValue({ ...event, endDate: new Date(NaN) } as Calendar.ExpoCalendarEvent);
  await expect(createCalendarEvent(input)).resolves.toMatchObject({
    outcome: 'unknown',
    retryable: false,
  });
  expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
});

test('a timed-out creation stays uncertain even when the native write completes later', async () => {
  let finish!: (value: Calendar.ExpoCalendarEvent) => void;
  createEvent.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const request = createCalendarEvent(input);
  await jest.advanceTimersByTimeAsync(NATIVE_TOOL_TIMEOUT_MS);
  await expect(request).resolves.toMatchObject({ outcome: 'unknown', retryable: false });
  finish(event);
  await jest.advanceTimersByTimeAsync(0);
  expect(createEvent).toHaveBeenCalledTimes(1);
  expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
});

test.each(['lookup', 'write'] as const)(
  'an update %s failure opens the same event and leaves requested changes for the user',
  async (stage) => {
    const failure = new Error('Invalid native return value');
    if (stage === 'lookup') jest.mocked(Calendar.ExpoCalendarEvent.get).mockRejectedValue(failure);
    else updateEvent.mockRejectedValue(failure);
    const result = await updateCalendarEvent({ id: '2', title: 'Changed', notes: null });
    expect(result).toMatchObject({
      status: 'requires_user_action',
      id: '2',
      saveConfirmed: false,
      retryable: false,
      requestedChanges: { title: 'Changed', notes: null },
    });
    expect(result).not.toHaveProperty('updated');
    expect(CalendarForm.editEventInCalendarAsync).toHaveBeenCalledWith(
      { id: '2' },
      { startNewActivityTask: true },
    );
    expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
  },
);

test('a pending update cannot race with user edits, including after a late rejection', async () => {
  let fail!: (error: Error) => void;
  updateEvent.mockReturnValue(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  const request = updateCalendarEvent({ id: '2', title: 'Changed' });
  await jest.advanceTimersByTimeAsync(NATIVE_TOOL_TIMEOUT_MS);
  await expect(request).resolves.toMatchObject({ id: '2', outcome: 'unknown', retryable: false });
  fail(new Error('Late native error'));
  await jest.advanceTimersByTimeAsync(0);
  expect(CalendarForm.editEventInCalendarAsync).not.toHaveBeenCalled();
});

test('an unavailable calendar app reports both failures without encouraging a retry', async () => {
  jest.mocked(Calendar.ExpoCalendar.get).mockRejectedValue(new Error('Lookup failed'));
  jest.mocked(CalendarForm.createEventInCalendarAsync).mockRejectedValue(new Error('No activity'));
  await expect(createCalendarEvent(input)).resolves.toMatchObject({
    status: 'error',
    retryable: false,
    error: 'Lookup failed',
    fallbackError: 'No activity',
  });
});

test('invalid dates fail before any native write or system form', async () => {
  await expect(createCalendarEvent({ ...input, endDate: input.startDate })).rejects.toThrow(
    'endDate must be after startDate',
  );
  expect(createEvent).not.toHaveBeenCalled();
  expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
});

test.each(['create', 'update'] as const)(
  'cancellation during %s lookup prevents the write and the fallback',
  async (operation) => {
    const controller = new AbortController();
    jest.mocked(Calendar.ExpoCalendar.get).mockImplementation(async () => {
      controller.abort();
      return calendar;
    });
    jest.mocked(Calendar.ExpoCalendarEvent.get).mockImplementation(async () => {
      controller.abort();
      throw new Error('Lookup failed after cancellation');
    });
    const request =
      operation === 'create'
        ? createCalendarEvent(input, controller.signal)
        : updateCalendarEvent({ id: '2', title: 'Changed' }, controller.signal);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(createEvent).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
    expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
    expect(CalendarForm.editEventInCalendarAsync).not.toHaveBeenCalled();
  },
);

test('native form cancellation propagates without becoming a retryable error', async () => {
  jest.mocked(Calendar.ExpoCalendar.get).mockRejectedValue(new Error('Lookup failed'));
  jest
    .mocked(CalendarForm.createEventInCalendarAsync)
    .mockRejectedValue(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
  await expect(createCalendarEvent(input)).rejects.toMatchObject({ name: 'AbortError' });
});

test('iOS failures retain the existing behavior without launching the Android fallback', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const failure = new Error('Native failure');
  jest.mocked(Calendar.ExpoCalendar.get).mockRejectedValue(failure);
  updateEvent.mockRejectedValue(failure);
  await expect(createCalendarEvent(input)).rejects.toBe(failure);
  await expect(updateCalendarEvent({ id: '2', title: 'Changed' })).rejects.toBe(failure);
  expect(CalendarForm.createEventInCalendarAsync).not.toHaveBeenCalled();
  expect(CalendarForm.editEventInCalendarAsync).not.toHaveBeenCalled();
});
