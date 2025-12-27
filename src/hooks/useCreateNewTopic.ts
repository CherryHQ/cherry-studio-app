import { useCurrentTopic } from '@/hooks/useTopic'
import { assistantService } from '@/services/AssistantService'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'

export function useCreateNewTopic() {
  const { switchTopic } = useCurrentTopic()

  const createNewTopic = async (assistant: Assistant): Promise<string> => {
    // Reset model to defaultModel when creating new topic
    if (assistant.defaultModel && assistant.model?.id !== assistant.defaultModel.id) {
      await assistantService.updateAssistant(assistant.id, { model: assistant.defaultModel })
    }

    // Create new topic directly
    const newTopic = await topicService.createTopic(assistant)
    await switchTopic(newTopic.id)
    return newTopic.id
  }

  return { createNewTopic }
}
