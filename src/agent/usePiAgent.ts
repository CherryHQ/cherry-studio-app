import type { AgentTool } from '@earendil-works/pi-agent-core'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Model as CherryModel, Provider as CherryProvider } from '@/types/assistant'

import { AgentService } from './AgentService'

export type AgentMessageView = {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

export type AgentToolRunView = {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  resultText?: string
}

/**
 * 把 pi-agent 的流式事件桥接到 React 状态：
 *  - 消息流（message_update 文本增量）
 *  - 工具轨迹（tool_execution_start/end）
 *  - 运行状态（agent_start / agent_end）
 */
export function usePiAgent(model: CherryModel | null, provider: CherryProvider | null, tools: AgentTool[]) {
  const serviceRef = useRef<AgentService | null>(null)
  const [messages, setMessages] = useState<AgentMessageView[]>([])
  const [toolRuns, setToolRuns] = useState<AgentToolRunView[]>([])
  const [running, setRunning] = useState(false)

  // 创建 / 重建 agent service
  useEffect(() => {
    if (!model || !provider) return

    const service = new AgentService(model, provider, tools)

    service.subscribe((event) => {
      switch (event.type) {
        case 'agent_start':
          setRunning(true)
          break
        case 'agent_end':
          setRunning(false)
          break
        case 'message_start':
          if (event.message.role === 'user') {
            const text =
              typeof event.message.content === 'string'
                ? event.message.content
                : event.message.content
                    .filter(part => part.type === 'text')
                    .map(part => (part as { text: string }).text)
                    .join('')
            setMessages(prev => [...prev, { id: event.message.timestamp.toString(), role: 'user', text }])
          }
          break
        case 'message_update': {
          const deltaEvent = event.assistantMessageEvent
          if (deltaEvent.type === 'text_delta') {
            setMessages(prev => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.role === 'assistant' && last.streaming) {
                next[next.length - 1] = { ...last, text: last.text + deltaEvent.delta }
              } else {
                next.push({
                  id: `assistant-${Date.now()}`,
                  role: 'assistant',
                  text: deltaEvent.delta,
                  streaming: true
                })
              }
              return next
            })
          }
          break
        }
        case 'message_end': {
          const msg = event.message
          if (msg.role === 'assistant') {
            setMessages(prev =>
              prev.map((m, i) => (i === prev.length - 1 && m.role === 'assistant' ? { ...m, streaming: false } : m))
            )
          }
          break
        }
        case 'tool_execution_start':
          setToolRuns(prev => [
            ...prev,
            {
              id: event.toolCallId,
              name: event.toolName,
              args: event.args as Record<string, unknown>,
              status: 'running'
            }
          ])
          break
        case 'tool_execution_end': {
          const resultText =
            event.result?.content
              ?.filter(part => part.type === 'text')
              .map(part => (part as { text: string }).text)
              .join('') ?? ''
          setToolRuns(prev =>
            prev.map(run =>
              run.id === event.toolCallId
                ? { ...run, status: event.isError ? 'error' : 'done', resultText }
                : run
            )
          )
          break
        }
        default:
          break
      }
    })

    serviceRef.current = service
    setMessages([])
    setToolRuns([])

    return () => {
      serviceRef.current = null
    }
    // tools 由调用方以稳定引用传入（useMemo），不影响重建频率
  }, [model, provider, tools])

  const send = useCallback(async (text: string) => {
    const service = serviceRef.current
    if (!service || !text.trim()) return
    setToolRuns([])
    await service.prompt(text.trim())
  }, [])

  const abort = useCallback(() => {
    serviceRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    serviceRef.current?.reset()
    setMessages([])
    setToolRuns([])
  }, [])

  return { messages, toolRuns, running, send, abort, reset }
}
