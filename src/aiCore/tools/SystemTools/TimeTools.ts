import { tool } from 'ai'
import { z } from 'zod'

import type { BuiltinTool } from '@/types/tool'
import { uuid } from '@/utils'

export const TIME_TOOLS: BuiltinTool[] = [
  {
    id: uuid(),
    name: 'GetCurrentTime',
    type: 'builtin',
    description: 'Get current time and date',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
]

/**
 * Get current time
 */
export const getCurrentTime = tool({
  description: 'Get current time and date',
  inputSchema: z.object({}),
  execute: () => {
    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toLocaleTimeString('en-US', { hour12: false })
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })

    return {
      time: `${date} ${time} (${weekday})`
    }
  }
})

/**
 * Combined export of all time tools as a ToolSet
 */
export const timeTools = {
  GetCurrentTime: getCurrentTime
}
