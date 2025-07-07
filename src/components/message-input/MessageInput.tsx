import { isEmpty } from 'lodash'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextArea, View, XStack, YStack } from 'tamagui'

import { useAssistant } from '@/hooks/useAssistant'
import { sendMessage as _sendMessage } from '@/services/MessagesService'
import { getUserMessage } from '@/services/MessagesService'
import { Assistant, Model, Topic } from '@/types/assistant'
import { FileType } from '@/types/file'
import { MessageInputBaseParams } from '@/types/message'

import { AddFileButton } from './AddFileButton'
import FilePreview from './FilePreview'
import { MentionButton } from './MentionButton'
import { SendButton } from './SendButton'
import { ThinkButton } from './ThinkButton'
import { VoiceButton } from './VoiceButton'
import { WebsearchButton } from './WebsearchButton'
interface MessageInputProps {
  topic: Topic
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const MessageInput: React.FC<MessageInputProps> = ({ topic, updateAssistant }) => {
  const { t } = useTranslation()
  const { assistant, isLoading } = useAssistant(topic.assistantId)

  const [text, setText] = useState('')
  const [files, setFiles] = useState<FileType[]>([])
  const [mentions, setMentions] = useState<Model[]>([])

  const sendMessage = async () => {
    if (isEmpty(text.trim()) || !assistant) {
      return
    }

    setText('')
    setFiles([])

    try {
      const baseUserMessage: MessageInputBaseParams = { assistant, topic, content: text }

      if (files.length > 0) {
        baseUserMessage.files = files
      }

      const { message, blocks } = getUserMessage(baseUserMessage)

      if (mentions.length > 0) {
        message.mentions = mentions
      }

      await _sendMessage(message, blocks, assistant, topic.id)
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  if (isLoading || !assistant) {
    return null
  }

  return (
    <View>
      <YStack gap={10}>
        {files.length > 0 && <FilePreview files={files} setFiles={setFiles} />}
        {/* message */}
        <XStack>
          <TextArea
            placeholder={t('inputs.placeholder')}
            borderWidth={0}
            backgroundColor="$colorTransparent"
            flex={1}
            value={text}
            onChangeText={setText}
          />
        </XStack>
        {/* button */}
        <XStack justifyContent="space-between" alignItems="center">
          <XStack gap={5} alignItems="center">
            <MentionButton mentions={mentions} setMentions={setMentions} />
            <AddFileButton files={files} setFiles={setFiles} />
            <WebsearchButton />
            <ThinkButton
              reasoningEffort={assistant.settings?.reasoning_effort}
              onReasoningEffortChange={async value =>
                await updateAssistant({
                  ...assistant,
                  settings: {
                    ...assistant.settings,
                    reasoning_effort: value
                  }
                })
              }
            />
          </XStack>
          <XStack gap={5} alignItems="center">
            <VoiceButton />
            <SendButton onSend={sendMessage} />
          </XStack>
        </XStack>
      </YStack>
    </View>
  )
}
