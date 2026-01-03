import { isEmpty } from 'lodash'
import { useCallback } from 'react'
import { Keyboard } from 'react-native'

import { useMessageEdit } from '@/hooks/useMessageEdit'
import { useMessageOperations } from '@/hooks/useMessageOperation'
import { loggerService } from '@/services/LoggerService'
import { editUserMessageAndRegenerate, getUserMessage, sendMessage as _sendMessage } from '@/services/MessagesService'
import { topicService } from '@/services/TopicService'
import type { Assistant, Model, Topic } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'
import type { MessageInputBaseParams } from '@/types/message'

const logger = loggerService.withContext('useMessageSend')

export interface UseMessageSendOptions {
  topic: Topic
  assistant: Assistant
  getText: () => string
  getFiles: () => FileMetadata[]
  getMentions: () => Model[]
  clearInputs: () => void
  onEditStart?: (content: string) => void
  onEditCancel?: () => void
}

export interface UseMessageSendReturn {
  sendMessage: (overrideText?: string) => Promise<void>
  onPause: () => Promise<void>
  isEditing: boolean
  cancelEditing: () => void
}

/**
 * Hook for managing message send and edit operations
 * Extracted from useMessageInputLogic lines 100-168
 */
export function useMessageSend(options: UseMessageSendOptions): UseMessageSendReturn {
  const { topic, assistant, getText, getFiles, getMentions, clearInputs, onEditStart, onEditCancel } = options

  const { pauseMessages } = useMessageOperations(topic)
  const { editingMessage, isEditing, cancelEdit, clearEditingState } = useMessageEdit({
    topicId: topic.id,
    onEditStart,
    onEditCancel
  })

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const textToSend = overrideText ?? getText()
      const trimmedText = textToSend.trim()
      const hasText = !isEmpty(trimmedText)
      const currentText = textToSend
      const currentFiles = getFiles()
      const currentMentions = getMentions()
      const currentEditingMessage = editingMessage
      const hasFiles = currentFiles.length > 0

      if (!hasText && !hasFiles) {
        return
      }

      clearInputs()
      Keyboard.dismiss()

      // Handle editing mode
      if (currentEditingMessage) {
        clearEditingState()
        await topicService.updateTopic(topic.id, { isLoading: true })

        try {
          await editUserMessageAndRegenerate(
            currentEditingMessage.id,
            hasText ? currentText : '',
            currentFiles,
            assistant,
            topic.id
          )
        } catch (error) {
          logger.error('Error editing message:', error)
        }
        return
      }

      // Normal send message flow
      await topicService.updateTopic(topic.id, { isLoading: true })

      try {
        const baseUserMessage: MessageInputBaseParams = { assistant, topic }

        if (hasText) {
          baseUserMessage.content = currentText
        }

        if (currentFiles.length > 0) {
          baseUserMessage.files = currentFiles
        }

        const { message, blocks } = getUserMessage(baseUserMessage)

        if (currentMentions.length > 0) {
          message.mentions = currentMentions
        }

        await _sendMessage(message, blocks, assistant, topic.id)
      } catch (error) {
        logger.error('Error sending message:', error)
      }
    },
    [getText, getFiles, getMentions, editingMessage, clearInputs, clearEditingState, topic, assistant]
  )

  const onPause = useCallback(async () => {
    try {
      await pauseMessages()
    } catch (error) {
      logger.error('Error pause message:', error)
    }
  }, [pauseMessages])

  return {
    sendMessage,
    onPause,
    isEditing,
    cancelEditing: cancelEdit
  }
}
