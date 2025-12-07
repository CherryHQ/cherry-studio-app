import type { Dispatch, SetStateAction } from 'react'
import React from 'react'

import XStack from '@/componentsV2/layout/XStack'
import type { Assistant, Model } from '@/types/assistant'

import { McpButton } from '../McpButton'
import { MentionButton } from '../MentionButton'
import { ThinkButton } from '../ThinkButton'

interface AccessoryActionsBarProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  isReasoning: boolean
  mentions: Model[]
  setMentions: Dispatch<SetStateAction<Model[]>>
}

export const AccessoryActionsBar: React.FC<AccessoryActionsBarProps> = ({
  assistant,
  updateAssistant,
  isReasoning,
  mentions,
  setMentions
}) => {
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
