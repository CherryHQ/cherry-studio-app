import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'
import type { MCPTool } from '@/types/tool'
const logger = loggerService.withContext('Prompt')

export const buildSystemPrompt = async (
  userSystemPrompt: string,
  tools?: MCPTool[],
  assistant?: Assistant
): Promise<string> => {
  if (typeof userSystemPrompt === 'string') {
    const now = new Date()

    if (userSystemPrompt.includes('{{date}}')) {
      const date = now.toLocaleDateString()
      userSystemPrompt = userSystemPrompt.replace(/{{date}}/g, date)
    }

    if (userSystemPrompt.includes('{{time}}')) {
      const time = now.toLocaleTimeString()
      userSystemPrompt = userSystemPrompt.replace(/{{time}}/g, time)
    }

    if (userSystemPrompt.includes('{{datetime}}')) {
      const datetime = now.toLocaleString()
      userSystemPrompt = userSystemPrompt.replace(/{{datetime}}/g, datetime)
    }

    // todo
    // if (userSystemPrompt.includes('{{language}}')) {
    //   try {
    //     const language = store.getState().settings.language
    //     userSystemPrompt = userSystemPrompt.replace(/{{language}}/g, language)
    //   } catch (error) {
    //     logger.error('Failed to get language:', error)
    //     userSystemPrompt = userSystemPrompt.replace(/{{language}}/g, 'Unknown System Language')
    //   }
    // }

    if (userSystemPrompt.includes('{{model_name}}')) {
      try {
        userSystemPrompt = userSystemPrompt.replace(/{{model_name}}/g, assistant?.model?.name || 'Unknown Model')
      } catch (error) {
        logger.error('Failed to get model name:', error)
        userSystemPrompt = userSystemPrompt.replace(/{{model_name}}/g, 'Unknown Model')
      }
    }

    // todo
    // if (userSystemPrompt.includes('{{username}}')) {
    //   try {
    //     const username = store.getState().settings.userName || 'Unknown Username'
    //     userSystemPrompt = userSystemPrompt.replace(/{{username}}/g, username)
    //   } catch (error) {
    //     logger.error('Failed to get username:', error)
    //     userSystemPrompt = userSystemPrompt.replace(/{{username}}/g, 'Unknown Username')
    //   }
    // }
  }

  // if (tools && tools.length > 0) {
  //   return SYSTEM_PROMPT.replace('{{ USER_SYSTEM_PROMPT }}', userSystemPrompt)
  //     .replace('{{ TOOL_USE_EXAMPLES }}', ToolUseExamples)
  //     .replace('{{ AVAILABLE_TOOLS }}', AvailableTools(tools))
  // }

  return userSystemPrompt
}
