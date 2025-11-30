import React from 'react'
import { Keyboard } from 'react-native'

import { IconButton } from '@/componentsV2/base/IconButton'
import {
  MdiLightbulbAutoOutline,
  MdiLightbulbOffOutline,
  MdiLightbulbOn,
  MdiLightbulbOn30,
  MdiLightbulbOn50,
  MdiLightbulbOn80
} from '@/componentsV2/icons'
import type { Assistant } from '@/types/assistant'

import { presentReasoningSheet, ReasoningSheet } from '../../Sheet/ReasoningSheet'

const REASONING_SHEET_NAME = 'think-button-reasoning-sheet'

interface ThinkButtonProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const ThinkButton: React.FC<ThinkButtonProps> = ({ assistant, updateAssistant }) => {
  const getIcon = () => {
    const size = 20

    switch (assistant.settings?.reasoning_effort) {
      case 'auto':
        return <MdiLightbulbAutoOutline size={size} />
      case 'high':
        return <MdiLightbulbOn size={size} />
      case 'medium':
        return <MdiLightbulbOn80 size={size} />
      case 'low':
        return <MdiLightbulbOn50 size={size} />
      case 'minimal':
        return <MdiLightbulbOn30 size={size} />
      case null:
      default:
        return <MdiLightbulbOffOutline size={size} />
    }
  }

  const handlePress = () => {
    Keyboard.dismiss()
    presentReasoningSheet(REASONING_SHEET_NAME)
  }

  return (
    <>
      <IconButton icon={getIcon()} onPress={handlePress} />

      {assistant.model && (
        <ReasoningSheet
          name={REASONING_SHEET_NAME}
          model={assistant.model}
          assistant={assistant}
          updateAssistant={updateAssistant}
        />
      )}
    </>
  )
}
