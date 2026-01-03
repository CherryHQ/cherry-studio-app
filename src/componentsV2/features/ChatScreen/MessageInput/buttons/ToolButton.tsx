import React from 'react'
import { Keyboard } from 'react-native'

import { LiquidGlassButton } from '@/componentsV2/base/LiquidGlassButton'
import { Plus } from '@/componentsV2/icons/LucideIcon'
import type { Assistant, Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

import { presentToolSheet } from '../../../Sheet/ToolSheet'

interface AddAssetsButtonProps {
  mentions: Model[]
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const ToolButton: React.FC<AddAssetsButtonProps> = ({
  mentions,
  files,
  setFiles,
  assistant,
  updateAssistant
}) => {
  const handlePress = () => {
    Keyboard.dismiss()
    presentToolSheet({
      mentions,
      files,
      setFiles,
      assistant,
      updateAssistant
    })
  }

  return (
    <LiquidGlassButton size={40} onPress={handlePress}>
      <Plus size={24} />
    </LiquidGlassButton>
  )
}
