import { BottomSheetModal } from '@gorhom/bottom-sheet'
import React, { useRef } from 'react'
import { Button } from 'tamagui'

import { ReasoningEffortOptions } from '@/types/assistant'

import {
  MdiLightbulbAutoOutline,
  MdiLightbulbOffOutline,
  MdiLightbulbOn10,
  MdiLightbulbOn50,
  MdiLightbulbOn90
} from '../icons/MdiLightbulbIcon'
import { ReasoningSheet } from '../sheets/ReasoningSheet'

interface ThinkButtonProps {
  reasoningEffort: ReasoningEffortOptions | undefined
  onReasoningEffortChange: (value: ReasoningEffortOptions) => void
}

export const ThinkButton: React.FC<ThinkButtonProps> = ({ reasoningEffort, onReasoningEffortChange }) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

  const getIcon = () => {
    const size = 24

    switch (reasoningEffort) {
      case 'auto':
        return <MdiLightbulbAutoOutline size={size} />
      case 'high':
        return <MdiLightbulbOn90 size={size} />
      case 'medium':
        return <MdiLightbulbOn50 size={size} />
      case 'low':
        return <MdiLightbulbOn10 size={size} />
      case null:
      default:
        return <MdiLightbulbOffOutline size={size} />
    }
  }

  const handlePress = () => {
    bottomSheetModalRef.current?.present()
  }

  const handleValueChange = (newValue: ReasoningEffortOptions) => {
    onReasoningEffortChange(newValue)
  }

  return (
    <>
      <Button
        chromeless
        size={24}
        icon={getIcon()}
        onPress={handlePress}
        color={reasoningEffort !== undefined ? 'rgba(0, 185, 107, 1)' : undefined}
      />

      <ReasoningSheet ref={bottomSheetModalRef} value={reasoningEffort || 'auto'} onValueChange={handleValueChange} />
    </>
  )
}
