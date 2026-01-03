import React from 'react'

import XStack from '@/componentsV2/layout/XStack'

import { McpButton, MentionButton, ThinkButton } from '../buttons'
import { useMessageInput } from '../context/MessageInputContext'

export const AccessoryBar: React.FC = () => {
  const { assistant, updateAssistant, isReasoning, mentions, setMentions } = useMessageInput()

  return (
    <XStack className="items-center gap-2 bg-transparent px-2.5">
      {isReasoning && <ThinkButton assistant={assistant} updateAssistant={updateAssistant} />}
      <MentionButton
        mentions={mentions}
        setMentions={setMentions}
        assistant={assistant}
        updateAssistant={updateAssistant}
      />
      <McpButton assistant={assistant} updateAssistant={updateAssistant} />
    </XStack>
  )
}
