import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, ToolCall, Usage } from '@earendil-works/pi-ai'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { streamText, type ToolSet } from 'ai'

import { createAiSdkProvider } from '@/aiCore/provider/factory'
import { prepareSpecialProviderConfig, providerToAiSdkConfig } from '@/aiCore/provider/providerConfig'
import type { Model as CherryModel, Provider as CherryProvider } from '@/types/assistant'

import { piMessagesToAiSdkMessages } from './messageBridge'
import { agentToolToAiSdkTool } from './toolAdapter'

/**
 * 用 Cherry 的 provider 体系实现 pi-agent-core 的 streamFn。
 *
 * pi-agent-core 的运行时不绑定任何模型后端，只要求一个满足
 * StreamFn 契约的函数。这里把它接到 Cherry 的 AI SDK provider：
 *   - pi 的 Context.messages → AI SDK model message
 *   - pi 的 AgentTool → AI SDK tool
 *   - AI SDK 的 fullStream 块 → pi 的 AssistantMessageEvent 协议
 *
 * 按 StreamFn 契约不抛出异常：失败通过 error 事件编码。
 */
export function createStreamFn(model: CherryModel, provider: CherryProvider): StreamFn {
  return (piModel, context, _options) => {
    const stream = createAssistantMessageEventStream()

    void (async () => {
      let text = ''
      const toolCalls: ToolCall[] = []

      const emptyUsage: Usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      }

      const buildPartial = (stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage => ({
        role: 'assistant',
        content: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...toolCalls
        ],
        api: provider.apiHost ?? 'custom',
        provider: provider.id,
        model: model.id,
        usage: emptyUsage,
        stopReason,
        timestamp: Date.now()
      })

      try {
        const config = providerToAiSdkConfig(provider, model)
        await prepareSpecialProviderConfig(provider, config)
        const localProvider = await createAiSdkProvider(config)
        if (!localProvider) {
          throw new Error('Failed to create provider instance')
        }

        const aiModel = localProvider.languageModel(model.id)
        const messages = piMessagesToAiSdkMessages(context.messages)
        const tools = context.tools?.length
          ? Object.fromEntries(context.tools.map(tool => [tool.name, agentToolToAiSdkTool(tool)]))
          : undefined

        const result = await streamText({
          model: aiModel,
          system: context.systemPrompt,
          messages,
          tools: tools as ToolSet | undefined
        })

        stream.push({ type: 'start', partial: buildPartial() })

        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta') {
            text += chunk.text
            stream.push({
              type: 'text_delta',
              contentIndex: 0,
              delta: chunk.text,
              partial: buildPartial()
            })
          } else if (chunk.type === 'tool-call') {
            // fullStream 的 tool-call 块有两种形态（静态/动态），
            // 统一用可选访问提取字段。
            const chunkAny = chunk as {
              toolCallId?: string
              toolName?: string
              input?: Record<string, unknown>
            }
            toolCalls.push({
              type: 'toolCall',
              id: chunkAny.toolCallId ?? `tool-${toolCalls.length}`,
              name: chunkAny.toolName ?? 'unknown',
              arguments: chunkAny.input ?? {}
            })
            stream.push({
              type: 'toolcall_end',
              contentIndex: text ? 1 : 0,
              toolCall: toolCalls[toolCalls.length - 1],
              partial: buildPartial()
            })
          }
        }

        const finalMessage = buildPartial()
        stream.push({ type: 'done', reason: 'stop', message: finalMessage })
        stream.end(finalMessage)
      } catch (error) {
        const errorMessage: AssistantMessage = {
          ...buildPartial('error'),
          errorMessage: error instanceof Error ? error.message : String(error)
        }
        stream.push({ type: 'error', reason: 'error', error: errorMessage })
        stream.end(errorMessage)
      }
    })()

    return stream
  }
}
