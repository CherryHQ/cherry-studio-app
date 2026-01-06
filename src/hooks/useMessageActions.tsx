import { messageBlockDatabase, messageDatabase } from '@database'
import { useNavigation } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'
import * as Speech from 'expo-speech'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Share from 'react-native-share'
import { useDispatch } from 'react-redux'

import { presentDialog } from '@/componentsV2'
import { dismissTextEditSheet, presentTextEditSheet } from '@/componentsV2/features/Sheet/TextEditSheet'
import { loggerService } from '@/services/LoggerService'
import {
  deleteMessageById,
  editAssistantMessage,
  fetchTranslateThunk,
  regenerateAssistantMessage,
  regenerateResponsesForUserMessage
} from '@/services/MessagesService'
import { setEditingMessage } from '@/store/runtime'
import type { Assistant } from '@/types/assistant'
import type { Message } from '@/types/message'
import type { HomeNavigationProps } from '@/types/naviagate'
import { markdownToPlainText } from '@/utils/markdown'
import { filterMessages } from '@/utils/messageUtils/filters'
import { findTranslationBlocks, getMainTextContent } from '@/utils/messageUtils/find'

import { useToast } from './useToast'

const logger = loggerService.withContext('useMessageActions')

type PlayState = 'idle' | 'playing'

interface UseMessageActionsProps {
  message: Message
  assistant?: Assistant
}

export const useMessageActions = ({ message, assistant }: UseMessageActionsProps) => {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const [playState, setPlayState] = useState<PlayState>('idle')
  const [isTranslating, setIsTranslating] = useState(false)
  const [isTranslated, setIsTranslated] = useState(false)
  const toast = useToast()
  const navigation = useNavigation<HomeNavigationProps>()

  useEffect(() => {
    const checkTranslation = async () => {
      if (!message) return

      try {
        const translationBlocks = await findTranslationBlocks(message)
        setIsTranslated(translationBlocks.length > 0)
      } catch (error) {
        logger.error('Error checking translation:', error)
        setIsTranslated(false)
      }
    }

    checkTranslation()
  }, [message])

  const handleCopy = async () => {
    try {
      const filteredMessages = await filterMessages([message])
      logger.info('Filtered Messages:', filteredMessages)
      const mainContent = await getMainTextContent(filteredMessages[0])
      await Clipboard.setStringAsync(mainContent)
      toast.show(t('common.copied'))
    } catch (error) {
      logger.error('Error copying message:', error)
    }
  }

  const handleDelete = async () => {
    return new Promise<void>((resolve, reject) => {
      presentDialog('error', {
        title: t('message.delete_message'),
        content: t('message.delete_message_confirmation'),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
        showCancel: true,
        onConfirm: async () => {
          try {
            await deleteMessageById(message.id)

            logger.info('Message deleted successfully:', message.id)
            resolve()
          } catch (error) {
            logger.error('Error deleting message:', error)
            presentDialog('error', {
              title: t('common.error'),
              content: t('common.error_occurred')
            })
            reject(error)
          }
        },
        onCancel: () => {
          reject(new Error('User cancelled'))
        }
      })
    })
  }

  const handleRegenerate = async () => {
    if (!assistant) {
      logger.warn('Cannot regenerate without assistant')
      return
    }

    try {
      if (message.role === 'user') {
        // For user messages: regenerate all linked assistant responses
        await regenerateResponsesForUserMessage(message, assistant)
      } else {
        // For assistant messages: regenerate this specific response
        await regenerateAssistantMessage(message, assistant)
      }
    } catch (error) {
      logger.error('Error regenerating message:', error)
    }
  }

  const handlePlay = async () => {
    try {
      if (playState === 'idle') {
        const filteredMessages = await filterMessages([message])
        const mainContent = await getMainTextContent(filteredMessages[0])
        const speechContent = markdownToPlainText(mainContent)
        Speech.speak(speechContent, { onDone: () => setPlayState('idle') })
        setPlayState('playing')
      } else if (playState === 'playing') {
        Speech.stop()
        setPlayState('idle')
      }
    } catch (error) {
      logger.error('Error controlling audio:', error)
      setPlayState('idle')
    }
  }

  const handleTranslate = async () => {
    if (!message) return

    try {
      if (isTranslating) return
      setIsTranslating(true)
      const messageId = message.id
      await fetchTranslateThunk(messageId, message)
      setIsTranslated(true)
    } catch (error) {
      logger.error('Error during translation:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('Translate assistant model is not defined')) {
        presentDialog('warning', {
          title: t('common.error_occurred'),
          content: t('error.translate_assistant_model_not_defined'),
          confirmText: t('common.go_to_settings'),
          onConfirm: () => {
            navigation.navigate('AssistantSettings', {
              screen: 'AssistantSettingsScreen'
            })
          }
        })
      } else {
        presentDialog('error', {
          title: t('common.error_occurred'),
          content: errorMessage
        })
      }
    } finally {
      setIsTranslating(false)
    }
  }

  const handleDeleteTranslation = async () => {
    if (!message) return

    try {
      const translationBlocks = await findTranslationBlocks(message)
      await messageBlockDatabase.removeManyBlocks(translationBlocks.map(block => block.id))

      const updatedMessage = {
        ...message,
        blocks: message.blocks.filter(blockId => !translationBlocks.some(block => block.id === blockId))
      }
      await messageDatabase.upsertMessages(updatedMessage)
      setIsTranslated(false)
    } catch (error) {
      logger.error('Error deleting translation:', error)
      throw error
    }
  }

  const getMessageContent = async () => {
    try {
      const filteredMessages = await filterMessages([message])
      return await getMainTextContent(filteredMessages[0])
    } catch (error) {
      logger.error('Error getting message content:', error)
      return ''
    }
  }

  const handleBestAnswer = async () => {
    try {
      const newUsefulState = !message.useful

      // 如果要标记为最佳答案，需要先将同一个askId组中的其他消息设置为非最佳答案
      if (newUsefulState && message.askId) {
        // 获取当前话题的所有消息
        const allMessages = await messageDatabase.getMessagesByTopicId(message.topicId)

        // 找到同一个askId组的所有消息（包括问题消息和其他回答）
        const relatedMessages = allMessages.filter(msg => msg.askId === message.askId || msg.id === message.askId)

        // 将所有相关消息的useful状态设置为false
        const updatePromises = relatedMessages
          .filter(msg => msg.id !== message.id && msg.useful) // 排除当前消息，只更新其他有用标记的消息
          .map(msg => messageDatabase.updateMessageById(msg.id, { useful: false }))

        await Promise.all(updatePromises)
        logger.info(`Reset useful state for ${updatePromises.length} related messages in askId group: ${message.askId}`)
      }

      // 更新当前消息的useful状态
      await messageDatabase.updateMessageById(message.id, { useful: newUsefulState })

      const successMessage = newUsefulState ? t('message.marked_as_best_answer') : t('message.unmarked_as_best_answer')

      toast.show(successMessage)
      logger.info(`Message ${message.id} useful state updated to: ${newUsefulState}`)
    } catch (error) {
      logger.error('Error updating message useful state:', error)
      toast.show(t('common.error_occurred'))
    }
  }
  const handleShare = async () => {
    try {
      // Get message content
      const filteredMessages = await filterMessages([message])
      logger.info('Filtered Messages:', filteredMessages)
      const mainContent = await getMainTextContent(filteredMessages[0])
      await Share.open({
        title: 'Cherry Studio',
        message: mainContent,
        failOnCancel: false
      })
    } catch (error) {
      logger.error('Error sharing message:', error)
      toast.show(t('common.error_occurred'))
    }
  }

  const handleEdit = async () => {
    if (message.role === 'system') {
      logger.warn('Cannot edit system messages')
      return
    }

    if (message.role === 'assistant') {
      // Assistant messages: use sheet for editing
      try {
        const content = await getMainTextContent(message)
        presentTextEditSheet(content, async (newContent: string) => {
          await editAssistantMessage(message.id, newContent)
          dismissTextEditSheet()
        })
      } catch (error) {
        logger.error('Error opening edit sheet:', error)
      }
    } else {
      // User messages: use existing input box editing
      dispatch(setEditingMessage(message))
    }
  }

  return {
    playState,
    isTranslating,
    isTranslated,
    handleCopy,
    handleDelete,
    handleRegenerate,
    handlePlay,
    handleTranslate,
    handleDeleteTranslation,
    getMessageContent,
    handleBestAnswer,
    isUseful: message.useful,
    handleShare,
    handleEdit
  }
}
