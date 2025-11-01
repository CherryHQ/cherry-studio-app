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
    return {
      time: new Date().toLocaleString()
    }
  }
})

/**
 * Combined export of all time tools as a ToolSet
 */
export const timeTools = {
  GetCurrentTime: getCurrentTime
}
