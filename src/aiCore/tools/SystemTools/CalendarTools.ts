import { tool } from 'ai'
import * as Calendar from 'expo-calendar'
import { z } from 'zod'

/**
 * Get all Calendars
 */
export const getAllCalendars = tool({
  description: 'Get all calendars',
  inputSchema: z.object({}),
  execute: async () => {
    await Calendar.requestCalendarPermissionsAsync()

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)

    const events = calendars.map(c => {
      return {
        id: c.id,
        title: c.title
      }
    })

    return { events }
  }
})

export const getCalendarEvents = tool({
  description: 'Get calendar events within a specific time period',
  inputSchema: z.object({
    calendarIds: z.array(z.string()).describe('Array of IDs of calendars to search for events in'),
    startDate: z.string().describe('Beginning of time period to search for events in (ISO 8601 date string)'),
    endDate: z.string().describe('End of time period to search for events in (ISO 8601 date string)')
  }),
  execute: async ({ calendarIds, startDate, endDate }) => {
    await Calendar.requestCalendarPermissionsAsync()

    const events = await Calendar.getEventsAsync(calendarIds, new Date(startDate), new Date(endDate))

    return {
      events: events.map(event => ({
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location || undefined,
        notes: event.notes || undefined,
        calendarId: event.calendarId
      }))
    }
  }
})

/**
 * Creates a new calendar event with specified title, date, time and duration
 */
export const createCalendarEvent = tool({
  description: 'Create a new calendar event',
  inputSchema: z.object({
    calendarId: z.string().describe('Calendar ID(You can get this through getCalendarEvents tool)'),
    title: z.string().describe('Event title'),
    date: z.string().describe('Event date (YYYY-MM-DD)'),
    time: z.string().optional().describe('Event time (HH:MM)'),
    duration: z.number().optional().describe('Duration in minutes'),
    notes: z.string().optional().describe('Event notes/description'),
    alarmMinutes: z
      .array(z.number())
      .optional()
      .describe(
        'Array of minutes before event to trigger alarms (e.g., [5, 30] means reminders at 5 and 30 minutes before)'
      )
  }),
  execute: async ({ calendarId, title, date, time, duration = 60, notes, alarmMinutes }) => {
    await Calendar.requestCalendarPermissionsAsync()

    const eventDate = new Date(date)
    if (time) {
      const [hours, minutes] = time.split(':').map(Number)
      eventDate.setHours(hours, minutes)
    }

    const alarms = alarmMinutes?.length ? alarmMinutes.map(minutes => ({ relativeOffset: -minutes })) : undefined

    const eventId = await Calendar.createEventAsync(calendarId, {
      title,
      startDate: eventDate,
      endDate: new Date(eventDate.getTime() + duration * 60 * 1000),
      notes,
      alarms
    })

    return { message: `Created "${title}"`, eventId }
  }
})

/**
 * Updates an existing calendar event
 */
export const updateCalendarEvent = tool({
  description: 'Update an existing calendar event',
  inputSchema: z.object({
    eventId: z.string().describe('ID of the event to update'),
    title: z.string().optional().describe('New event title'),
    date: z.string().optional().describe('New event date (YYYY-MM-DD)'),
    time: z.string().optional().describe('New event time (HH:MM)'),
    duration: z.number().optional().describe('New duration in minutes'),
    notes: z.string().optional().describe('Event notes/description'),
    alarmMinutes: z
      .array(z.number())
      .optional()
      .describe(
        'Array of minutes before event to trigger alarms (e.g., [5, 30] means reminders at 5 and 30 minutes before)'
      )
  }),
  execute: async ({ eventId, title, date, time, duration, notes, alarmMinutes }) => {
    await Calendar.requestCalendarPermissionsAsync()

    const details: Partial<Calendar.Event> = {}

    if (title) details.title = title
    if (notes) details.notes = notes

    // Handle date/time updates
    if (date || time || duration) {
      const event = await Calendar.getEventAsync(eventId)
      const startDate = new Date(event.startDate)

      if (date) {
        const [year, month, day] = date.split('-').map(Number)
        startDate.setFullYear(year, month - 1, day)
      }
      if (time) {
        const [hours, minutes] = time.split(':').map(Number)
        startDate.setHours(hours, minutes)
      }

      details.startDate = startDate
      const eventDuration =
        duration ?? (new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) / 60000
      details.endDate = new Date(startDate.getTime() + eventDuration * 60 * 1000)
    }

    // Handle alarms
    if (alarmMinutes) {
      details.alarms = alarmMinutes.map(minutes => ({ relativeOffset: -minutes }))
    }

    await Calendar.updateEventAsync(eventId, details)

    return { message: `Updated event "${eventId}"` }
  }
})

/**
 * Deletes a calendar event
 */
export const deleteCalendarEvent = tool({
  description: 'Delete a calendar event',
  inputSchema: z.object({
    eventId: z.string().describe('ID of the event to delete')
  }),
  execute: async ({ eventId }) => {
    await Calendar.requestCalendarPermissionsAsync()
    await Calendar.deleteEventAsync(eventId)
    return { message: `Deleted event "${eventId}"` }
  }
})

/**
 * Combined export of all calendar tools as a ToolSet
 */
export const calendarTools = {
  GetAllCalendars: getAllCalendars,
  CreateCalendarEvent: createCalendarEvent,
  GetCalendarEvents: getCalendarEvents,
  UpdateCalendarEvent: updateCalendarEvent,
  DeleteCalendarEvent: deleteCalendarEvent
}
