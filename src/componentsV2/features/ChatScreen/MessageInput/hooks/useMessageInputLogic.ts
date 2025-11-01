import { isEmpty } from 'lodash'
import { useEffect, useState } from 'react'
import { Keyboard } from 'react-native'

import { isReasoningModel } from '@/config/models'
import { useMessageOperations } from '@/hooks/useMessageOperation'
import { loggerService } from '@/services/LoggerService'
import { getUserMessage, sendMessage as _sendMessage } from '@/services/MessagesService'
import { topicService } from '@/services/TopicService'
import type { Assistant, Model, Topic } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'
import type { MessageInputBaseParams } from '@/types/message'

const logger = loggerService.withContext('Message Input')

export const useMessageInputLogic = (topic: Topic, assistant: Assistant) => {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<FileMetadata[]>([])
  const [mentions, setMentions] = useState<Model[]>([])
  const { pauseMessages } = useMessageOperations(topic)

  const isReasoning = isReasoningModel(assistant.model)

  useEffect(() => {
    setMentions(assistant.defaultModel ? [assistant.defaultModel] : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id])

  const sendMessage = async () => {
    if (isEmpty(text.trim())) {
      return
    }

    setText('')
    setFiles([])
    Keyboard.dismiss()
    await topicService.updateTopic(topic.id, { isLoading: true })

    try {
      const baseUserMessage: MessageInputBaseParams = { assistant, topic, content: text }

      if (files.length > 0) {
        baseUserMessage.files = files
      }

      const { message, blocks } = getUserMessage(baseUserMessage)

      if (mentions.length > 0) {
        message.mentions = mentions
      }

      await _sendMessage(message, blocks, assistant, topic.id)
    } catch (error) {
      logger.error('Error sending message:', error)
    }
  }

  const onPause = async () => {
    try {
      await pauseMessages()
    } catch (error) {
      logger.error('Error pause message:', error)
    }
  }

  return {
    text,
    setText,
    files,
    setFiles,
    mentions,
    setMentions,
    isReasoning,
    sendMessage,
    onPause
  }
}
