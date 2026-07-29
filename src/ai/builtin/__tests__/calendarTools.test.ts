import type { Tool, ToolSet } from 'ai';
import * as Calendar from 'expo-calendar';

import {
  createCalendarCreateTools,
  createCalendarModifyTools,
  createCalendarReadTools,
  createReminderReadTools,
  createReminderWriteTools,
} from '../calendarTools';

const mockEvent = {
  allDay: false,
  calendarId: 'calendar-1',
  delete: jest.fn(async () => undefined),
  endDate: new Date('2026-07-28T11:00:00Z'),
  id: 'event-1',
  startDate: new Date('2026-07-28T10:00:00Z'),
  title: 'Planning',
  update: jest.fn(async () => undefined),
};
const mockReminder = {
  calendarId: 'reminders-1',
  completed: false,
  delete: jest.fn(async () => undefined),
  id: 'reminder-1',
  title: 'Review plan',
  update: jest.fn(async () => undefined),
};
const mockEventCalendar = {
  allowsModifications: true,
  createEvent: jest.fn(async () => mockEvent),
  id: 'calendar-1',
  isPrimary: true,
  title: 'Calendar',
};
const mockReminderList = {
  allowsModifications: true,
  createReminder: jest.fn(async () => mockReminder),
  id: 'reminders-1',
  isPrimary: true,
  listReminders: jest.fn(async () => [mockReminder]),
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

describe('calendar tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(Calendar.getCalendars)
      .mockImplementation(async (entityType) =>
        entityType === Calendar.EntityTypes.REMINDER
          ? ([mockReminderList] as never)
          : ([mockEventCalendar] as never),
      );
    jest.mocked(Calendar.getDefaultCalendarSync).mockReturnValue(mockEventCalendar as never);
    jest
      .mocked(Calendar.ExpoCalendar.get)
      .mockImplementation(async (id) =>
        id === 'reminders-1' ? (mockReminderList as never) : (mockEventCalendar as never),
      );
    jest.mocked(Calendar.ExpoCalendarEvent.get).mockResolvedValue(mockEvent as never);
    jest.mocked(Calendar.ExpoCalendarReminder.get).mockResolvedValue(mockReminder as never);
    jest.mocked(Calendar.listEvents).mockResolvedValue([mockEvent, mockEvent, mockEvent] as never);
  });

  test('lists no more than the requested calendar event limit', async () => {
    const result = (await executeTool(createCalendarReadTools(), 'builtin_list_calendar_events', {
      endDate: '2026-07-29T00:00:00Z',
      limit: 2,
      startDate: '2026-07-28T00:00:00Z',
    })) as unknown[];

    expect(result).toHaveLength(2);
    expect(Calendar.listEvents).toHaveBeenCalledWith(
      ['calendar-1'],
      new Date('2026-07-28T00:00:00Z'),
      new Date('2026-07-29T00:00:00Z'),
    );
  });

  test('creates, updates, and deletes calendar events without attendees', async () => {
    await executeTool(createCalendarCreateTools(), 'builtin_create_calendar_event', {
      endDate: '2026-07-28T11:00:00Z',
      startDate: '2026-07-28T10:00:00Z',
      title: 'Planning',
    });
    const modifyTools = createCalendarModifyTools();
    await executeTool(modifyTools, 'builtin_update_calendar_event', {
      id: 'event-1',
      title: 'Updated planning',
    });
    await executeTool(modifyTools, 'builtin_delete_calendar_event', { id: 'event-1' });

    expect(mockEventCalendar.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        endDate: new Date('2026-07-28T11:00:00Z'),
        startDate: new Date('2026-07-28T10:00:00Z'),
        title: 'Planning',
      }),
    );
    expect(mockEvent.update).toHaveBeenCalledWith({
      endDate: undefined,
      startDate: undefined,
      title: 'Updated planning',
    });
    expect(mockEvent.delete).toHaveBeenCalled();
  });

  test('queries and mutates reminders on iOS', async () => {
    const readTools = createReminderReadTools();
    const writeTools = createReminderWriteTools();
    expect(Object.keys(readTools)).not.toHaveLength(0);

    const reminders = (await executeTool(readTools, 'builtin_list_reminders', {
      endDate: '2026-07-29T00:00:00Z',
      limit: 50,
      startDate: '2026-07-28T00:00:00Z',
      status: 'all',
    })) as unknown[];
    await executeTool(writeTools, 'builtin_create_reminder', {
      listId: 'reminders-1',
      title: 'Review plan',
    });
    await executeTool(writeTools, 'builtin_update_reminder', {
      completed: true,
      id: 'reminder-1',
    });
    await executeTool(writeTools, 'builtin_delete_reminder', { id: 'reminder-1' });

    expect(reminders).toHaveLength(1);
    expect(mockReminderList.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Review plan' }),
    );
    expect(mockReminder.update).toHaveBeenCalledWith(expect.objectContaining({ completed: true }));
    expect(mockReminder.delete).toHaveBeenCalled();
  });

  test('rejects calendar queries longer than 90 days before calling native code', async () => {
    await expect(
      executeTool(createCalendarReadTools(), 'builtin_list_calendar_events', {
        endDate: '2026-04-02T00:00:00Z',
        limit: 100,
        startDate: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toThrow('cannot exceed 90 days');
    expect(Calendar.listEvents).not.toHaveBeenCalled();
  });
});

function executeTool(tools: ToolSet, name: string, input: unknown) {
  const selected = tools[name] as Tool | undefined;
  if (!selected?.execute) {
    throw new Error(`Missing executable tool: ${name}`);
  }
  return selected.execute(input, { messages: [], toolCallId: 'call-1' });
}
