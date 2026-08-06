import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Tool as PiTool } from '@earendil-works/pi-ai'
import type { Tool } from 'ai'
import type { ZodType } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

/**
 * 把 Cherry 现有的 AI SDK 工具（SystemTools 里的提醒、日历、快捷指令、
 * 时间、网络等）适配为 pi-agent-core 的 AgentTool。
 *
 * AI SDK tool 的 inputSchema 是 zod schema，pi 的 parameters 是
 * JSON Schema 形状（typebox），用 zod-to-json-schema 转换。
 */
export function aiSdkToolToAgentTool(name: string, aiTool: Tool): AgentTool {
  const inputSchema = aiTool.inputSchema as ZodType | object | undefined
  const parameters =
    inputSchema && typeof (inputSchema as ZodType).safeParse === 'function'
      ? zodToJsonSchema(inputSchema as ZodType)
      : (inputSchema as object)

  return {
    name,
    label: name,
    description: aiTool.description ?? name,
    parameters: parameters as AgentTool['parameters'],
    execute: async (callId, args, _signal, _onUpdate) => {
      if (!aiTool.execute) {
        throw new Error(`Tool "${name}" has no execute function`)
      }
      const result = await aiTool.execute(args, undefined as never)
      const text =
        typeof result === 'string'
          ? result
          : typeof result === 'object' && result !== null
            ? JSON.stringify(result, null, 2)
            : String(result)
      return { content: [{ type: 'text', text }], details: { raw: result } }
    }
  }
}

/**
 * 把 pi 的 AgentTool 反向适配为 AI SDK tool，供 streamText 使用。
 * 这样 agent 循环里的工具和 Cherry 的 provider 是同一套工具协议。
 */
export function agentToolToAiSdkTool(agentTool: PiTool): Tool & { execute: NonNullable<Tool['execute']> } {
  const toolAny = agentTool as unknown as AgentTool
  return {
    description: toolAny.description ?? agentTool.name,
    inputSchema: agentTool.parameters as Tool['inputSchema'],
    execute: async (args, options) => {
      const result = await toolAny.execute('', args, options?.abortSignal, undefined)
      const text = result.content
        .filter(part => part.type === 'text')
        .map(part => (part as { text: string }).text)
        .join('')
      return text || 'OK'
    }
  }
}
