import { isEmpty } from 'lodash'
import { useTranslation } from 'react-i18next'
import { Keyboard } from 'react-native'

import { presentDialog } from '@/componentsV2/base/Dialog'
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
  text: string
  files: FileMetadata[]
  mentions: Model[]
  clearInputs: () => void
  restoreInputs: (text: string, files: FileMetadata[]) => void
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
  const { topic, assistant, text, files, mentions, clearInputs, restoreInputs, onEditStart, onEditCancel } = options
  const { t } = useTranslation()

  const { pauseMessages } = useMessageOperations(topic)
  const { editingMessage, isEditing, cancelEdit, clearEditingState } = useMessageEdit({
    topicId: topic.id,
    onEditStart,
    onEditCancel
  })

  const sendMessage = async (overrideText?: string) => {
    logger.info('sendMessage called', {
      hasOverrideText: !!overrideText,
      textLength: text.length,
      filesCount: files.length
    })

    const textToSend = overrideText ?? text
    const trimmedText = textToSend.trim()
    const hasText = !isEmpty(trimmedText)
    const currentText = textToSend
    const currentFiles = files
    const currentMentions = mentions
    const currentEditingMessage = editingMessage
    const hasFiles = currentFiles.length > 0

    logger.info('sendMessage state', { textLength: textToSend.length, hasText, hasFiles })

    if (!hasText && !hasFiles) {
      logger.info('sendMessage early return: no text or files')
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
        await topicService.updateTopic(topic.id, { isLoading: false })
        restoreInputs(currentText, currentFiles)
        presentDialog('error', {
          title: t('message.edit_failed.title'),
          content: t('message.edit_failed.content')
        })
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
      await topicService.updateTopic(topic.id, { isLoading: false })
      restoreInputs(currentText, currentFiles)
      presentDialog('error', {
        title: t('message.send_failed.title'),
        content: t('message.send_failed.content')
      })
    }
  }

  const onPause = async () => {
    try {
      await pauseMessages()
    } catch (error) {
      logger.error('Error pause message:', error)
      presentDialog('error', {
        title: t('message.pause_failed.title'),
        content: t('message.pause_failed.content')
      })
    }
  }

  return {
    sendMessage,
    onPause,
    isEditing,
    cancelEditing: cancelEdit
  }
}
