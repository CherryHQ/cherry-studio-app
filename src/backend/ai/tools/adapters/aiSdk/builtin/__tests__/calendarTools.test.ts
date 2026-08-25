import type { Tool } from 'ai';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

import { createCalendarToolEntries, createReminderToolEntries } from '../calendarTools';

const event = {
  allDay: false,
  calendarId: 'calendar-1',
  delete: jest.fn(async () => undefined),
  endDate: new Date('2026-07-29T11:00:00Z'),
  id: 'event-1',
  startDate: new Date('2026-07-29T10:00:00Z'),
  title: 'Planning',
  update: jest.fn(async () => undefined),
};
const reminder = {
  calendarId: 'reminders-1',
  completed: false,
  delete: jest.fn(async () => undefined),
  id: 'reminder-1',
  title: 'Review',
  update: jest.fn(async () => undefined),
};
const eventCalendar = {
  allowsModifications: true,
  createEvent: jest.fn(async () => event),
  id: 'calendar-1',
  isPrimary: true,
  source: { name: 'Local', type: 'local' },
  title: 'Calendar',
};
const reminderList = {
  allowsModifications: true,
  createReminder: jest.fn(async () => reminder),
  id: 'reminders-1',
  isPrimary: true,
  listReminders: jest.fn(async () => [reminder]),
  source: { name: 'Local', type: 'local' },
  title: 'Reminders',
};

jest.mock('expo-calendar', () => ({
  EntityTypes: { EVENT: 'event', REMINDER: 'reminder' },
  ReminderStatus: { COMPLETED: 'completed', INCOMPLETE: 'incomplete' },
  ExpoCalendar: { get: jest.fn() },
  ExpoCalendarEvent: { get: jest.fn() },
  ExpoCalendarReminder: { get: jest.fn() },
  getCalendars: jest.fn(),
  getDefaultCalendarSync: jest.fn(),
  listEvents: jest.fn(),
}));

describe('calendar and reminder adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest
      .mocked(Calendar.getCalendars)
      .mockImplementation(async (type) =>
        type === Calendar.EntityTypes.REMINDER
          ? ([reminderList] as never)
          : ([eventCalendar] as never),
      );
    jest.mocked(Calendar.getDefaultCalendarSync).mockReturnValue(eventCalendar as never);
    jest
      .mocked(Calendar.ExpoCalendar.get)
      .mockImplementation(async (id) =>
        id === 'reminders-1' ? (reminderList as never) : (eventCalendar as never),
      );
    jest.mocked(Calendar.ExpoCalendarEvent.get).mockResolvedValue(event as never);
    jest.mocked(Calendar.ExpoCalendarReminder.get).mockResolvedValue(reminder as never);
    jest.mocked(Calendar.listEvents).mockResolvedValue([event, event, event] as never);
  });

  test('normalizes collection and limit sentinels for calendar reads', async () => {
    const output = (await execute(calendarTool('calendar_list_events'), {
      calendarIds: [],
      endDate: '2026-07-30T00:00:00Z',
      limit: 0,
      startDate: '2026-07-29T00:00:00Z',
    })) as unknown[];
    expect(output).toHaveLength(3);
    expect(Calendar.listEvents).toHaveBeenCalledWith(
      ['calendar-1'],
      new Date('2026-07-29T00:00:00Z'),
      new Date('2026-07-30T00:00:00Z'),
    );
  });

  test('omits empty create sentinels and updates only selected fields', async () => {
    await execute(calendarTool('calendar_create_event'), {
      allDay: false,
      calendarId: '',
      endDate: '2026-07-29T11:00:00Z',
      location: '',
      notes: '',
      startDate: '2026-07-29T10:00:00Z',
      timeZone: '',
      title: 'Planning',
    });
    await execute(calendarTool('calendar_update_event'), {
      allDay: true,
      endDate: '',
      fields: ['title', 'notes'],
      id: 'event-1',
      location: 'unused',
      notes: '',
      startDate: '',
      timeZone: '',
      title: 'Updated',
    });

    expect(eventCalendar.createEvent).toHaveBeenCalledWith({
      allDay: false,
      endDate: new Date('2026-07-29T11:00:00Z'),
      startDate: new Date('2026-07-29T10:00:00Z'),
      title: 'Planning',
    });
    expect(event.update).toHaveBeenCalledWith({ notes: null, title: 'Updated' });
  });

  test('selects a writable calendar on Android without calling the iOS-only default API', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });

    await execute(calendarTool('calendar_create_event'), {
      allDay: false,
      calendarId: '',
      endDate: '2026-07-29T11:00:00Z',
      location: '',
      notes: '',
      startDate: '2026-07-29T10:00:00Z',
      timeZone: '',
      title: 'Android planning',
    });

    expect(Calendar.getDefaultCalendarSync).not.toHaveBeenCalled();
    expect(Calendar.getCalendars).toHaveBeenCalledWith(Calendar.EntityTypes.EVENT);
    expect(eventCalendar.createEvent).toHaveBeenCalled();
  });

  test('creates, updates, lists, and deletes reminders with strict inputs', async () => {
    const entries = reminderEntries();
    await execute(find(entries, 'reminder_list_items'), {
      endDate: '2026-07-30T00:00:00Z',
      limit: 0,
      listIds: [],
      startDate: '2026-07-29T00:00:00Z',
      status: 'all',
    });
    await execute(find(entries, 'reminder_create_item'), {
      completed: false,
      dueDate: '',
      listId: '',
      location: '',
      notes: '',
      startDate: '',
      timeZone: '',
      title: 'Review',
    });
    await execute(find(entries, 'reminder_update_item'), {
      completed: true,
      dueDate: '',
      fields: ['completed', 'dueDate'],
      id: 'reminder-1',
      location: '',
      notes: '',
      startDate: '',
      timeZone: '',
      title: '',
    });
    await execute(find(entries, 'reminder_delete_item'), { id: 'reminder-1' });

    expect(reminderList.createReminder).toHaveBeenCalledWith({ completed: false, title: 'Review' });
    expect(reminder.update).toHaveBeenCalledWith({ completed: true, dueDate: null });
    expect(reminder.delete).toHaveBeenCalled();
  });

  test('returns typed native errors and rethrows cancellation', async () => {
    jest.mocked(Calendar.listEvents).mockRejectedValueOnce(new Error('offline'));
    await expect(
      execute(calendarTool('calendar_list_events'), {
        calendarIds: ['calendar-1'],
        endDate: '2026-07-30T00:00:00Z',
        limit: 10,
        startDate: '2026-07-29T00:00:00Z',
      }),
    ).resolves.toEqual({ error: 'offline', retryable: true });

    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      execute(
        calendarTool('calendar_list_events'),
        {
          calendarIds: [],
          endDate: '2026-07-30T00:00:00Z',
          limit: 10,
          startDate: '2026-07-29T00:00:00Z',
        },
        controller.signal,
      ),
    ).rejects.toThrow('cancelled');
  });
});

function deps() {
  return {
    devicePermissions: { getStatusForScope: jest.fn(async () => 'granted') },
  } as never;
}

function calendarTool(name: string): Tool {
  return find(createCalendarToolEntries(deps()), name);
}

function reminderEntries() {
  return createReminderToolEntries(deps());
}

function find(entries: { name: string; tool: Tool }[], name: string): Tool {
  const selected = entries.find((entry) => entry.name === name)?.tool;
  if (!selected) throw new Error(`Missing tool: ${name}`);
  return selected;
}

function execute(selected: Tool, input: unknown, signal?: AbortSignal) {
  if (!selected.execute) throw new Error('Tool is not executable');
  return selected.execute(input, {
    abortSignal: signal,
    experimental_context: { abortSignal: signal, requestId: 'request-1' },
    messages: [],
    toolCallId: 'call-1',
  });
}
