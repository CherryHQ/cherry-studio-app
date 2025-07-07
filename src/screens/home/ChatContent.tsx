import React from 'react'
import { ScrollView } from 'tamagui'

import { useAssistant } from '@/hooks/useAssistant'
import { Topic } from '@/types/assistant'

import Messages from './messages/Messages'

interface ChatContentProps {
  topic: Topic
}

const ChatContent = ({ topic }: ChatContentProps) => {
  const { assistant, isLoading } = useAssistant(topic.assistantId)

  if (isLoading || !assistant) {
    return null
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Messages key={topic.id} assistant={assistant} topic={topic} />
    </ScrollView>
  )
}

export default ChatContent
