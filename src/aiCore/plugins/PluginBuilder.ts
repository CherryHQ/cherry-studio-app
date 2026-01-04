import type { AiPlugin } from '@cherrystudio/ai-core'
import { createPromptToolUsePlugin, webSearchPlugin } from '@cherrystudio/ai-core/built-in/plugins'

import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

import type { AiSdkMiddlewareConfig } from '../middleware/AiSdkMiddlewareBuilder'
import reasoningTimePlugin from './reasoningTimePlugin'
import { searchOrchestrationPlugin } from './searchOrchestrationPlugin'

const logger = loggerService.withContext('PluginBuilder')

/**
 * 根据条件构建插件数组
 */
export function buildPlugins(
  middlewareConfig: AiSdkMiddlewareConfig & { assistant: Assistant; topicId?: string }
): AiPlugin[] {
  const plugins: AiPlugin[] = []

  // 1. 模型内置搜索
  if (middlewareConfig.enableWebSearch && middlewareConfig.webSearchPluginConfig) {
    plugins.push(webSearchPlugin(middlewareConfig.webSearchPluginConfig))
  }
  // 2. 开启网络搜索并且支持工具调用时添加搜索插件
  if (middlewareConfig.enableWebSearch && (middlewareConfig.isSupportedToolUse || middlewareConfig.isPromptToolUse)) {
    plugins.push(searchOrchestrationPlugin(middlewareConfig.assistant, middlewareConfig.topicId || ''))
  }

  // 3. 推理模型时添加推理插件
  if (middlewareConfig.enableReasoning) {
    plugins.push(reasoningTimePlugin)
  }

  // 4. 启用Prompt工具调用时添加工具插件
  if (middlewareConfig.isPromptToolUse) {
    plugins.push(
      createPromptToolUsePlugin({
        enabled: true,
        createSystemMessage: (systemPrompt, params, context) => {
          const modelId = typeof context.model === 'string' ? context.model : context.model.modelId
          if (modelId.includes('o1-mini') || modelId.includes('o1-preview')) {
            if (context.isRecursiveCall) {
              return null
            }
            params.messages = [
              {
                role: 'assistant',
                content: systemPrompt
              },
              ...params.messages
            ]
            return null
          }
          return systemPrompt
        }
      })
    )
  }

  // if (middlewareConfig.enableUrlContext && middlewareConfig.) {
  //   plugins.push(googleToolsPlugin({ urlContext: true }))
  // }

  logger.debug(
    'Final plugin list:',
    plugins.map(p => p.name)
  )
  return plugins
}
