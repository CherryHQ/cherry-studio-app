import { AnimatePresence, MotiView } from 'moti'
import React, { useCallback, useMemo, useState } from 'react'
import { Platform, View } from 'react-native'
import { Image } from 'react-native-compressor'

import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { Assistant, Topic } from '@/types/assistant'
import { FileTypes } from '@/types/file'
import { uuid } from '@/utils'

import { presentExpandInputSheet } from '../../Sheet/ExpandInputSheet'
import { AccessoryActionsBar } from './components/AccessoryActionsBar'
import { PreviewPanel } from './components/PreviewPanel'
import { useMessageInputLogic } from './hooks/useMessageInputLogic'
import { PauseButton } from './PauseButton'
import { SendButton } from './SendButton'
import { ToolButton } from './ToolButton'
import { VoiceButton } from './VoiceButton'

const logger = loggerService.withContext('MessageInput')

interface MessageInputProps {
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const MessageInput: React.FC<MessageInputProps> = ({ topic, assistant, updateAssistant }) => {
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

  const shouldShowVoice = isVoiceActive || !text

  const actionButton = useMemo(() => {
    return (
      <AnimatePresence exitBeforeEnter>
        {topic.isLoading ? (
          <MotiView
            key="pause-button"
            from={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'timing', duration: 200 }}>
            <PauseButton onPause={onPause} />
          </MotiView>
        ) : shouldShowVoice ? (
          <MotiView
            key="voice-button"
            from={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'timing', duration: 200 }}>
            <VoiceButton onTranscript={setText} onListeningChange={setIsVoiceActive} />
          </MotiView>
        ) : (
          <MotiView
            key="send-button"
            from={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'timing', duration: 200 }}>
            <SendButton onSend={sendMessage} />
          </MotiView>
        )}
      </AnimatePresence>
    )
  }, [topic.isLoading, shouldShowVoice, onPause, setText, sendMessage])

  return (
    <View
      className="px-3"
      style={{
        paddingBottom: Platform.OS === 'android' ? bottomPad + 8 : bottomPad
      }}>
      <YStack className="gap-2.5">
        <View>
          <XStack className="items-end gap-2">
            <View className="h-[42px] items-center justify-center">
              <ToolButton
                mentions={mentions}
                files={files}
                setFiles={setFiles}
                assistant={assistant}
                updateAssistant={updateAssistant}
              />
            </View>
            <PreviewPanel
              assistant={assistant}
              updateAssistant={updateAssistant}
              isEditing={isEditing}
              onCancelEditing={cancelEditing}
              files={files}
              setFiles={setFiles}
              text={text}
              onTextChange={setText}
              onExpand={handleExpand}
              onPasteImages={handlePasteImages}
              actionButton={actionButton}
            />
          </XStack>
        </View>

        <AccessoryActionsBar
          assistant={assistant}
          updateAssistant={updateAssistant}
          isReasoning={isReasoning}
          mentions={mentions}
          setMentions={setMentions}
        />
      </YStack>
    </View>
  )
}
