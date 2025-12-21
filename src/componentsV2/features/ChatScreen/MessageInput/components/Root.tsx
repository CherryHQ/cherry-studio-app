import React, { useCallback, useState } from 'react'
import { Platform, View } from 'react-native'
import { Image } from 'react-native-compressor'

import { useBottom } from '@/hooks/useBottom'
import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { Assistant, Topic } from '@/types/assistant'
import { FileTypes } from '@/types/file'
import { uuid } from '@/utils'

import { presentExpandInputSheet } from '../../../Sheet/ExpandInputSheet'
import { MessageInputContext, type MessageInputContextValue } from '../context/MessageInputContext'
import { useMessageInputLogic } from '../hooks/useMessageInputLogic'
import { DefaultLayout } from './DefaultLayout'

const logger = loggerService.withContext('MessageInput')

interface RootProps {
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  children?: React.ReactNode
}

export const Root: React.FC<RootProps> = ({ topic, assistant, updateAssistant, children }) => {
  const bottomPad = useBottom()
  const {
    text,
    setText,
    files,
    setFiles,
    mentions,
    setMentions,
    isReasoning,
    isEditing,
    sendMessage,
    onPause,
    cancelEditing
  } = useMessageInputLogic(topic, assistant)

  const [isVoiceActive, setIsVoiceActive] = useState(false)

  const handleExpand = useCallback(() => {
    presentExpandInputSheet(text, setText, sendMessage)
  }, [sendMessage, setText, text])

  const handlePasteImages = useCallback(
    async (uris: string[]) => {
      try {
        logger.info('Processing pasted images', { count: uris.length })

        const processedFiles = await Promise.all(
          uris.map(async (uri, index) => {
            const id = uuid()
            const fileName = `pasted-image-${Date.now()}-${index}`
            const ext = uri.toLowerCase().endsWith('.gif') ? 'gif' : 'jpg'

            // Compress non-GIF images
            const processedUri = ext === 'gif' ? uri : await Image.compress(uri)

            return {
              id,
              name: `${fileName}.${ext}`,
              origin_name: `${fileName}.${ext}`,
              path: processedUri,
              size: 0,
              ext,
              type: FileTypes.IMAGE,
              created_at: Date.now(),
              count: 1
            }
          })
        )

        const uploadedFiles = await uploadFiles(processedFiles)
        setFiles(prev => [...prev, ...uploadedFiles])

        logger.info('Pasted images processed successfully', { count: uploadedFiles.length })
      } catch (err) {
        logger.error('Error processing pasted images', err)
      }
    },
    [setFiles]
  )

  const contextValue: MessageInputContextValue = {
    topic,
    assistant,
    updateAssistant,
    text,
    setText,
    files,
    setFiles,
    mentions,
    setMentions,
    isReasoning,
    isEditing,
    isLoading: Boolean(topic.isLoading),
    sendMessage,
    onPause,
    cancelEditing,
    handleExpand,
    handlePasteImages,
    isVoiceActive,
    setIsVoiceActive
  }

  return (
    <MessageInputContext.Provider value={contextValue}>
      <View
        className="px-3"
        style={{
          paddingBottom: Platform.OS === 'android' ? bottomPad + 8 : bottomPad
        }}>
        {children ?? <DefaultLayout />}
      </View>
    </MessageInputContext.Provider>
  )
}
