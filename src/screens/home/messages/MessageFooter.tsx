import { Copy, MoreHorizontal, RefreshCw } from '@tamagui/lucide-icons'
import BottomSheet from '@gorhom/bottom-sheet'
import * as Clipboard from 'expo-clipboard'
import React, { useEffect, useState } from 'react'
import { Button, View, XStack } from 'tamagui'

import { TranslatedIcon, TranslationIcon } from '@/components/icons/TranslationIcon'
import { loggerService } from '@/services/LoggerService'
import { regenerateAssistantMessage, fetchTranslate } from '@/services/MessagesService'
import { Assistant } from '@/types/assistant'
import { Message } from '@/types/message'
import { filterMessages } from '@/utils/messageUtils/filters'
import { findTranslationBlocks, getMainTextContent } from '@/utils/messageUtils/find'

import { removeManyBlocks } from '../../../../db/queries/messageBlocks.queries'
import { upsertMessages } from '../../../../db/queries/messages.queries'
const logger = loggerService.withContext('MessageFooter')

interface MessageFooterProps {
  assistant: Assistant
  message: Message
  bottomSheetRef: React.RefObject<BottomSheet>
  setIsBottomSheetOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const MessageFooter = ({ message, assistant, bottomSheetRef, setIsBottomSheetOpen }: MessageFooterProps) => {
  const [isTranslating, setIsTranslating] = useState(false)

  const [isTranslated, setIsTranslated] = useState(false)

  useEffect(() => {
    const checkTranslation = async () => {
      try {
        const translationBlocks = await findTranslationBlocks(message)
        setIsTranslated(translationBlocks.length > 0)
      } catch (error) {
        logger.error('Error checking translation:', error)
        setIsTranslated(false)
      }
    }

    checkTranslation()
  })

  const handleBottomSheetOpen = () => {
    bottomSheetRef.current?.expand()
    setIsBottomSheetOpen(true)
  }

  const onCopy = async () => {
    // todo: 暂时无法复制翻译后的message
    try {
      const filteredMessages = await filterMessages([message])
      logger.info('Filtered Messages:', filteredMessages)
      const mainContent = await getMainTextContent(filteredMessages[0])
      await Clipboard.setStringAsync(mainContent)
    } catch (error) {
      logger.error('Error copying message:', error)
      // 可以添加 toast 提示用户复制失败
    }
  }

  const onRegenerate = async () => {
    try {
      await regenerateAssistantMessage(message, assistant)
    } catch (error) {
      logger.error('Error regenerating message:', error)
      // 可以添加 toast 提示用户重新生成失败
    }
  }

  const onTranslate = async () => {
    try {
      if (isTranslating) return
      setIsTranslating(true)
      const messageId = message.id
      await fetchTranslate(messageId, message)
      setIsTranslated(true) // 翻译成功后更新状态
    } catch (error) {
      logger.error('Error during translation:', error)
      // 可以添加 toast 提示用户翻译失败
    } finally {
      setIsTranslating(false)
    }
  }

  const onDeleteTranslation = async () => {
    try {
      // 1. 删除 translation block
      const translationBlocks = await findTranslationBlocks(message)
      await removeManyBlocks(translationBlocks.map(block => block.id))

      // 2. 删除 message 中的 translation block id
      const updatedMessage = {
        ...message,
        blocks: message.blocks.filter(blockId => !translationBlocks.some(block => block.id === blockId))
      }
      await upsertMessages(updatedMessage)
      setIsTranslated(false) // 删除成功后更新状态
    } catch (error) {
      logger.error('Error deleting translation:', error)
      // 可以添加 toast 提示用户删除失败
    }
  }

  // const onDownload = async () => {
  //   try {
  //     // TODO: 实现下载功能
  //     logger.log('Download functionality not implemented yet')
  //   } catch (error) {
  //     logger.error('Error downloading message:', error)
  //   }
  // }

  // const onExternalLink = async () => {
  //   try {
  //     // TODO: 实现外部链接功能
  //     logger.log('External link functionality not implemented yet')
  //   } catch (error) {
  //     logger.error('Error opening external link:', error)
  //   }
  // }

  return (
    <View>
      <XStack gap={20}>
        <Button chromeless circular size={24} icon={<Copy size={18} />} onPress={onCopy}></Button>
        <Button
          chromeless
          circular
          size={24}
          icon={isTranslated ? <TranslatedIcon size={18} /> : <TranslationIcon size={18} />}
          onPress={isTranslated ? onDeleteTranslation : onTranslate}></Button>
        <Button chromeless circular size={24} icon={<RefreshCw size={18} />} onPress={onRegenerate}></Button>
        <Button
          chromeless
          circular
          size={24}
          icon={<MoreHorizontal size={18} />}
          onPress={handleBottomSheetOpen}></Button>
        {/* <Button chromeless circular size={24} icon={<Download size={18} />}></Button> */}
        {/* <Button chromeless circular size={24} icon={<ExternalLink size={18} />}></Button> */}
      </XStack>
    </View>
  )
}

export default MessageFooter
