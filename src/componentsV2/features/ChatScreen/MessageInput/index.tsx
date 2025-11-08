import { AnimatePresence, MotiView } from 'moti'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import TextField from '@/componentsV2/base/TextField'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import type { Assistant, Topic } from '@/types/assistant'

import { FilePreview } from './FilePreview'
import { useMessageInputLogic } from './hooks/useMessageInputLogic'
import { McpButton } from './McpButton'
import { MentionButton } from './MentionButton'
import { PauseButton } from './PauseButton'
import { SendButton } from './SendButton'
import { ThinkButton } from './ThinkButton'
import { ToolButton } from './ToolButton'
import { ToolPreview } from './ToolPreview'

interface MessageInputProps {
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const MessageInput: React.FC<MessageInputProps> = ({ topic, assistant, updateAssistant }) => {
  const { t } = useTranslation()
  const bottomPad = useBottom()
  const { text, setText, files, setFiles, mentions, setMentions, isReasoning, sendMessage, onPause } =
    useMessageInputLogic(topic, assistant)

  return (
    <View
      className="bg-background-secondary dark:bg-background-secondary rounded-3xl px-5 py-2"
      style={{
        paddingBottom: Platform.OS === 'android' ? bottomPad + 8 : bottomPad
      }}>
      <YStack className="gap-2.5">
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
          <XStack className="flex-1 items-center gap-[10px]">
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
            <ToolPreview assistant={assistant} updateAssistant={updateAssistant} />
          </XStack>
          <XStack className="items-center gap-5">
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
              ) : (
                <MotiView
                  key="send-button"
                  from={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ type: 'timing', duration: 200 }}>
                  <SendButton onSend={sendMessage} disabled={!text} />
                </MotiView>
              )}
            </AnimatePresence>
          </XStack>
        </XStack>
      </YStack>
    </View>
  )
}
