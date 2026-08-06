import type { Message as PiMessage } from '@earendil-works/pi-ai'
import type { ModelMessage } from 'ai'

/**
 * 把 pi-agent-core 的消息（AgentMessage）转换为 AI SDK 的 model message。
 *
 * pi 的消息类型：user / assistant / toolResult。
 * AI SDK v5 的消息类型：system / user / assistant / tool。
 * - assistant 的 toolCall 块 → assistant content 里的 tool-call part
 * - toolResult → tool 消息的 tool-result part（按 toolCallId 关联）
 */
function extractText(message: PiMessage): string {
  if ('content' in message) {
    const content = message.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter(part => part.type === 'text')
        .map(part => (part as { text: string }).text)
        .join('')
    }
  }
  return ''
}

export function piMessagesToAiSdkMessages(messages: PiMessage[]): ModelMessage[] {
  const converted: ModelMessage[] = []
  for (const message of messages) {
    switch (message.role) {
      case 'user':
        converted.push({ role: 'user', content: extractText(message) } as ModelMessage)
        break
      case 'assistant': {
        const text = extractText(message)
        const toolCalls = message.content
          .filter(part => part.type === 'toolCall')
          .map(part => ({
            type: 'tool-call' as const,
            toolCallId: part.id,
            toolName: part.name,
            args: part.arguments
          }))
        converted.push({
          role: 'assistant',
          content: [...(text ? [{ type: 'text' as const, text }] : []), ...toolCalls]
        } as ModelMessage)
        break
      }
      case 'toolResult':
        converted.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: message.toolCallId,
              toolName: message.toolName,
              result: extractText(message) || 'OK'
            }
          ]
        } as unknown as ModelMessage)
        break
      default:
        break
    }
  }
  return converted
}
