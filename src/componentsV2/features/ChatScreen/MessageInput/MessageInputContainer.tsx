import React from 'react'

import { useAssistant } from '@/hooks/useAssistant'
import type { Topic } from '@/types/assistant'

import { MessageInput } from './index'

interface MessageInputContainerProps {
  topic: Topic
}

/**
 * Convenience wrapper that fetches assistant data based on topic.assistantId
 * and passes it to MessageInput
 */
export const MessageInputContainer: React.FC<MessageInputContainerProps> = ({ topic }) => {
  const { assistant, isLoading, updateAssistant } = useAssistant(topic.assistantId)

  if (isLoading || !assistant) {
    return null
  }

  return <MessageInput topic={topic} assistant={assistant} updateAssistant={updateAssistant} />
}
