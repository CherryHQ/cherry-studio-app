import { t } from 'i18next'

import type { MCPServer } from '@/types/mcp'
import type { MCPTool } from '@/types/tool'
import { uuid } from '@/utils'

export type BuiltinMcpId = keyof typeof BuiltinMcpIds

export const BuiltinMcpIds = {
  '@cherry/fetch': '@cherry/fetch',
  '@cherry/time': '@cherry/time',
  '@cherry/calendar': '@cherry/calendar',
  '@cherry/reminder': '@cherry/reminder'
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
          }
        },
        required: ['calendarId', 'title', 'date']
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
  ]
}

export function initBuiltinMcp(): MCPServer[] {
  return [
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
}
