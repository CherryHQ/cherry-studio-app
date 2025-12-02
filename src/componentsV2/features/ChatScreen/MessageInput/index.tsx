import { AnimatePresence, MotiView } from 'moti'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import { MentionButton } from '@/componentsV2'
import TextField from '@/componentsV2/base/TextField'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import { useTheme } from '@/hooks/useTheme'
import type { Assistant, Topic } from '@/types/assistant'

import { FilePreview } from './FilePreview'
import { useMessageInputLogic } from './hooks/useMessageInputLogic'
import { McpButton } from './McpButton'
import { PauseButton } from './PauseButton'
import { SendButton } from './SendButton'
import { ThinkButton } from './ThinkButton'
import { ToolButton } from './ToolButton'
import { ToolPreview } from './ToolPreview'
import { VoiceButton } from './VoiceButton'

interface MessageInputProps {
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const MessageInput: React.FC<MessageInputProps> = ({ topic, assistant, updateAssistant }) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const bottomPad = useBottom()
  const { text, setText, files, setFiles, mentions, setMentions, isReasoning, sendMessage, onPause } =
    useMessageInputLogic(topic, assistant)
  const [isVoiceActive, setIsVoiceActive] = useState(false)

  return (
    <View
      className="bg-background-secondary rounded-3xl p-3"
      style={{
        paddingBottom: Platform.OS === 'android' ? bottomPad + 8 : bottomPad,
        shadowColor: isDark ? '#fff' : '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10
      }}>
      <YStack className="gap-2.5">
        <ToolPreview assistant={assistant} updateAssistant={updateAssistant} />
        {files.length > 0 && <FilePreview files={files} setFiles={setFiles} />}
        {/* message */}
        <XStack className="top-[5px]">
          <TextField className="w-full p-0">
            <TextField.Input
              className="text-text-primary h-24 border-none p-0 text-base"
              placeholder={t('inputs.placeholder')}
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={10}
              selectionColor="#2563eb"
              colors={{
                blurBackground: 'transparent',
                focusBackground: 'transparent',
                blurBorder: 'transparent',
                focusBorder: 'transparent'
              }}
            />
          </TextField>
        </XStack>
        {/* button */}
        <XStack className="items-center justify-between">
          <XStack className="flex-1 items-center gap-2.5">
            <ToolButton
              mentions={mentions}
              files={files}
              setFiles={setFiles}
              assistant={assistant}
              updateAssistant={updateAssistant}
            />
            {isReasoning && <ThinkButton assistant={assistant} updateAssistant={updateAssistant} />}
            <MentionButton
              mentions={mentions}
              setMentions={setMentions}
              assistant={assistant}
              updateAssistant={updateAssistant}
            />
            <McpButton assistant={assistant} updateAssistant={updateAssistant} />
          </XStack>
          <XStack className="items-center gap-2.5">
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
              ) : isVoiceActive || !text ? (
                <MotiView
                  key="voice-button"
                  from={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ type: 'timing', duration: 200 }}>
                  <VoiceButton onTranscript={newText => setText(newText)} onListeningChange={setIsVoiceActive} />
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
          </XStack>
        </XStack>
      </YStack>
    </View>
  )
}
