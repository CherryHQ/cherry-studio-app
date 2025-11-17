import { isEmpty } from 'lodash'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Keyboard } from 'react-native'

import { isReasoningModel } from '@/config/models'
import { useMessageOperations } from '@/hooks/useMessageOperation'
import { useAllProviders } from '@/hooks/useProviders'
import { saveTextAsFile } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import { getUserMessage, sendMessage as _sendMessage } from '@/services/MessagesService'
import { topicService } from '@/services/TopicService'
import type { Assistant, Model, Topic } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'
import type { MessageInputBaseParams } from '@/types/message'
import { getModelUniqId } from '@/utils/model'

const logger = loggerService.withContext('Message Input')

const LONG_TEXT_THRESHOLD = 5000

export const useMessageInputLogic = (topic: Topic, assistant: Assistant) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<FileMetadata[]>([])
  const [mentions, setMentions] = useState<Model[]>([])
  const { pauseMessages } = useMessageOperations(topic)
  const { providers } = useAllProviders()

  const isReasoning = isReasoningModel(assistant.model)

  const handleTextChange = async (newText: string) => {
    // Check if text exceeds threshold
    if (newText.length > LONG_TEXT_THRESHOLD) {
      try {
        logger.info(`Long text detected: ${newText.length} characters, converting to file`)
        const fileMetadata = await saveTextAsFile(newText)
        setFiles(prev => [...prev, fileMetadata])
        setText('')
        Alert.alert(
          t('inputs.longTextConverted.title'),
          t('inputs.longTextConverted.message', { length: newText.length })
        )
      } catch (error) {
        logger.error('Error converting long text to file:', error)
        setText(newText)
      }
    } else {
      setText(newText)
    }
  }

  useEffect(() => {
    setMentions(assistant.defaultModel ? [assistant.defaultModel] : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id])

  // Sync mentions with available models from providers
  useEffect(() => {
    if (mentions.length === 0) return

    // Build a set of all available model unique IDs
    const availableModelIds = new Set<string>()
    providers.forEach(provider => {
      if (provider.enabled && provider.models) {
        provider.models.forEach(model => {
          availableModelIds.add(getModelUniqId(model))
        })
      }
    })

    // Filter out mentions that are no longer available
    const validMentions = mentions.filter(mention => availableModelIds.has(getModelUniqId(mention)))

    // Update mentions if any were removed
    if (validMentions.length !== mentions.length) {
      logger.info(`Removed ${mentions.length - validMentions.length} invalid model(s) from mentions`)
      setMentions(validMentions)
    }
  }, [providers, mentions])

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
    setText: handleTextChange,
    files,
    setFiles,
    mentions,
    setMentions,
    isReasoning,
    sendMessage,
    onPause
  }
}
