import { messageDatabase } from '@database'

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

    // Check if the newest topic has messages
    const newestTopic = await topicService.getNewestTopic()
    const hasMessages = await messageDatabase.getHasMessagesWithTopicId(newestTopic?.id ?? '')

    let topicId: string

    if (hasMessages || !newestTopic) {
      // Create new topic
      const newTopic = await topicService.createTopic(assistant)
      topicId = newTopic.id
    } else {
      // Reuse the newest topic (update assistant if different)
      if (newestTopic.assistantId !== assistant.id) {
        await topicService.updateTopic(newestTopic.id, { assistantId: assistant.id })
      }
      topicId = newestTopic.id
    }

    await switchTopic(topicId)
    return topicId
  }

  return { createNewTopic }
}
