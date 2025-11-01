import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import React, { useRef } from 'react'
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

import { ReasoningSheet } from '../../Sheet/ReasoningSheet'

interface ThinkButtonProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const ThinkButton: React.FC<ThinkButtonProps> = ({ assistant, updateAssistant }) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

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
    bottomSheetModalRef.current?.present()
  }

  return (
    <>
      <IconButton icon={getIcon()} onPress={handlePress} />

      {assistant.model && (
        <ReasoningSheet
          ref={bottomSheetModalRef}
          model={assistant.model}
          assistant={assistant}
          updateAssistant={updateAssistant}
        />
      )}
    </>
  )
}
