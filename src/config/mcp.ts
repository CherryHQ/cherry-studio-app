import { t } from 'i18next'
import { Platform } from 'react-native'

import type { MCPServer } from '@/types/mcp'
import type { MCPTool } from '@/types/tool'
import { uuid } from '@/utils'

export type BuiltinMcpId = keyof typeof BuiltinMcpIds

export const BuiltinMcpIds = {
  '@cherry/fetch': '@cherry/fetch',
  '@cherry/time': '@cherry/time',
  '@cherry/calendar': '@cherry/calendar',
  '@cherry/reminder': '@cherry/reminder',
  '@cherry/shortcuts': '@cherry/shortcuts'
}

export const BUILTIN_TOOLS: Record<BuiltinMcpId, MCPTool[]> = {
  '@cherry/calendar': [
    {
      id: uuid(),
      name: 'GetAllCalendars',
      serverId: uuid(),
      serverName: '@cherry/calendar',
      isBuiltIn: true,
      type: 'mcp',
      description: 'Get all calendars',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      id: uuid(),
      name: 'GetCalendarEvents',
      serverId: uuid(),
      serverName: '@cherry/calendar',
      isBuiltIn: true,
      type: 'mcp',
      description: 'Get calendar events within a specific time period',
      inputSchema: {
        type: 'object',
        properties: {
          calendarIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of IDs of calendars to search for events in'
          },
          startDate: {
            type: 'string',
            description: 'Beginning of time period to search for events in (ISO 8601 date string)'
          },
          endDate: {
            type: 'string',
            description: 'End of time period to search for events in (ISO 8601 date string)'
          }
        },
        required: ['calendarIds', 'startDate', 'endDate']
      }
    },
    {
      id: uuid(),
      name: 'CreateCalendarEvent',
      serverId: uuid(),
      serverName: '@cherry/calendar',
      isBuiltIn: true,
      type: 'mcp',
      description: 'Create a new calendar event',
      inputSchema: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: 'Calendar ID'
          },
          title: {
            type: 'string',
            description: 'Event title'
          },
          date: {
            type: 'string',
            description: 'Event date (YYYY-MM-DD)'
          },
          time: {
            type: 'string',
            description: 'Event time (HH:MM)'
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes'
          },
          notes: {
            type: 'string',
            description: 'Event notes/description'
          },
          alarmMinutes: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Array of minutes before event to trigger alarms (e.g., [5, 30] means reminders at 5 and 30 minutes before)'
          }
        },
        required: ['calendarId', 'title', 'date']
      }
    },
    {
      id: uuid(),
      name: 'UpdateCalendarEvent',
      serverId: uuid(),
      serverName: '@cherry/calendar',
      isBuiltIn: true,
      type: 'mcp',
      description: 'Update an existing calendar event',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'ID of the event to update'
          },
          title: {
            type: 'string',
            description: 'New event title'
          },
          date: {
            type: 'string',
            description: 'New event date (YYYY-MM-DD)'
          },
          time: {
            type: 'string',
            description: 'New event time (HH:MM)'
          },
          duration: {
            type: 'number',
            description: 'New duration in minutes'
          },
          notes: {
            type: 'string',
            description: 'Event notes/description'
          },
          alarmMinutes: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Array of minutes before event to trigger alarms (e.g., [5, 30] means reminders at 5 and 30 minutes before)'
          }
        },
        required: ['eventId']
      }
    },
    {
      id: uuid(),
      name: 'DeleteCalendarEvent',
      serverId: uuid(),
      serverName: '@cherry/calendar',
      isBuiltIn: true,
      type: 'mcp',
      description: 'Delete a calendar event',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'ID of the event to delete'
          }
        },
        required: ['eventId']
      }
    }
  ],
  '@cherry/fetch': [
    {
      id: uuid(),
      name: 'FetchUrlAsHtml',
      serverId: uuid(),
      serverName: '@cherry/fetch',
      isBuiltIn: true,
      type: 'mcp',
      description: 'Fetch URL content as HTML',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            description: 'The URL to fetch'
          }
        },
        required: ['url']
      }
    },
    {
      id: uuid(),
      name: 'FetchUrlAsJson',
      serverId: uuid(),
      serverName: '@cherry/fetch',
      isBuiltIn: true,
      type: 'mcp',
      description: 'Fetch URL content as JSON',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            description: 'The URL to fetch'
          }
        },
        required: ['url']
      }
    }
  ],
  '@cherry/time': [
    {
      id: uuid(),
      name: 'GetCurrentTime',
      type: 'mcp',
      serverId: uuid(),
      serverName: '@cherry/time',
      isBuiltIn: true,
      description: 'Get current time and date',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  ],
  '@cherry/reminder': [
    {
      id: uuid(),
      name: 'GetAllReminders',
      type: 'mcp',
      serverId: uuid(),
      serverName: '@cherry/reminder',
      isBuiltIn: true,
      description: 'Get all reminders',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      id: uuid(),
      name: 'GetReminders',
      type: 'mcp',
      serverId: uuid(),
      serverName: '@cherry/reminder',
      isBuiltIn: true,
      description: 'Get reminders within a specific time period',
      inputSchema: {
        type: 'object',
        properties: {
          calendarIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of IDs of calendars to search for reminders in'
          },
          startDate: {
            type: 'string',
            description: 'Beginning of time period to search for reminders in (ISO 8601 date string)'
          },
          endDate: {
            type: 'string',
            description: 'End of time period to search for reminders in (ISO 8601 date string)'
          }
        },
        required: ['calendarIds', 'startDate', 'endDate']
      }
    },
    {
      id: uuid(),
      name: 'CreateReminder',
      type: 'mcp',
      serverId: uuid(),
      serverName: '@cherry/reminder',
      isBuiltIn: true,
      description: 'Create a new reminder',
      inputSchema: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: 'Calendar ID'
          },
          title: {
            type: 'string',
            description: 'Reminder title'
          },
          dueDate: {
            type: 'string',
            description: 'Due date (ISO 8601 date string)'
          },
          notes: {
            type: 'string',
            description: 'Reminder notes'
          },
          location: {
            type: 'string',
            description: 'Reminder location'
          }
        },
        required: ['calendarId', 'title']
      }
    },
    {
      id: uuid(),
      name: 'DeleteReminder',
      type: 'mcp',
      serverId: uuid(),
      serverName: '@cherry/reminder',
      isBuiltIn: true,
      description: 'Delete a reminder',
      inputSchema: {
        type: 'object',
        properties: {
          reminderId: {
            type: 'string',
            description: 'Reminder ID to delete'
          }
        },
        required: ['reminderId']
      }
    }
  ],
  '@cherry/shortcuts': [
    {
      id: uuid(),
      name: 'RunShortcut',
      type: 'mcp',
      serverId: uuid(),
      serverName: '@cherry/shortcuts',
      isBuiltIn: true,
      description: 'Run an iOS Shortcut by name and return the result',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The exact name of the iOS Shortcut to run'
          },
          input: {
            type: 'string',
            enum: ['text', 'clipboard'],
            description: 'Type of input to pass to the shortcut (optional)'
          },
          text: {
            type: 'string',
            description: 'Text content to pass as input (only used when input is "text")'
          }
        },
        required: ['name']
      }
    }
  ]
}

export function initBuiltinMcp(): MCPServer[] {
  const servers: MCPServer[] = [
    {
      id: '@cherry/fetch',
      name: '@cherry/fetch',
      type: 'inMemory',
      description: t('mcp.builtin.fetch.description'),
      isActive: false
    },
    {
      id: '@cherry/time',
      name: '@cherry/time',
      type: 'inMemory',
      description: t('mcp.builtin.time.description'),
      isActive: false
    },
    {
      id: '@cherry/calendar',
      name: '@cherry/calendar',
      type: 'inMemory',
      description: t('mcp.builtin.calendar.description'),
      isActive: false
    },
    {
      id: '@cherry/reminder',
      name: '@cherry/reminder',
      type: 'inMemory',
      description: t('mcp.builtin.reminder.description'),
      isActive: false
    }
  ]

  if (Platform.OS === 'ios') {
    servers.push({
      id: '@cherry/shortcuts',
      name: '@cherry/shortcuts',
      type: 'inMemory',
      description: t('mcp.builtin.shortcuts.description'),
      isActive: false
    })
  }

  return servers
}
