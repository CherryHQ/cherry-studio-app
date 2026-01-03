import React, { useCallback, useMemo } from 'react'
import { Platform, View } from 'react-native'

import { isReasoningModel } from '@/config/models'
import { useBottom } from '@/hooks/useBottom'
import type { Assistant, Topic } from '@/types/assistant'

import { presentExpandInputSheet } from '../../../Sheet/ExpandInputSheet'
import { MessageInputContext, type MessageInputContextValue } from '../context/MessageInputContext'
import { useFileAttachments, useMentions, useMessageSend, useTextInput, useVoiceInput } from '../hooks'
import { DefaultLayout } from './DefaultLayout'

interface RootProps {
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  children?: React.ReactNode
}

export const Root: React.FC<RootProps> = ({ topic, assistant, updateAssistant, children }) => {
  const bottomPad = useBottom()

  // Compose hooks
  const { files, setFiles, addFiles, clearFiles, handlePasteImages } = useFileAttachments()

  const { text, setText, clearText } = useTextInput({
    onFileCreated: file => addFiles([file])
  })

  const { mentions, setMentions } = useMentions({
    topicId: topic.id,
    assistant,
    updateAssistant
  })

  const clearInputs = useCallback(() => {
    clearText()
    clearFiles()
  }, [clearText, clearFiles])

  const handleEditStart = useCallback(
    (content: string) => {
      setText(content)
      clearFiles()
    },
    [setText, clearFiles]
  )

  const handleEditCancel = useCallback(() => {
    clearText()
    clearFiles()
  }, [clearText, clearFiles])

  const { sendMessage, onPause, isEditing, cancelEditing } = useMessageSend({
    topic,
    assistant,
    text,
    files,
    mentions,
    clearInputs,
    onEditStart: handleEditStart,
    onEditCancel: handleEditCancel
  })

  const { isVoiceActive, setIsVoiceActive } = useVoiceInput()

  const isReasoning = isReasoningModel(assistant.model)

  const handleExpand = useCallback(() => {
    presentExpandInputSheet(text, setText, sendMessage, files.length > 0)
  }, [files.length, sendMessage, setText, text])

  // MEMOIZED context value (fixes previous issue)
  const contextValue = useMemo<MessageInputContextValue>(
    () => ({
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
    }),
    [
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
      sendMessage,
      onPause,
      cancelEditing,
      handleExpand,
      handlePasteImages,
      isVoiceActive,
      setIsVoiceActive
    ]
  )

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
