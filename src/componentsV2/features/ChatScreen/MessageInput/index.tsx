import React, { useCallback, useState } from 'react'
import { Platform, View } from 'react-native'

import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import type { Assistant, Topic } from '@/types/assistant'

import { presentExpandInputSheet } from '../../Sheet/ExpandInputSheet'
import { AccessoryActionsBar } from './components/AccessoryActionsBar'
import { PreviewPanel } from './components/PreviewPanel'
import { PrimaryActionSwitcher } from './components/PrimaryActionSwitcher'
import { useMessageInputLogic } from './hooks/useMessageInputLogic'
import { ToolButton } from './ToolButton'

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

  return (
    <View
      className="p-3"
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
            />
            <PrimaryActionSwitcher
              isTopicLoading={Boolean(topic.isLoading)}
              isVoiceActive={isVoiceActive}
              hasText={Boolean(text)}
              onPause={onPause}
              onSend={sendMessage}
              onTranscript={setText}
              onVoiceActiveChange={setIsVoiceActive}
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
