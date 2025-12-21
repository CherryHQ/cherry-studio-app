import React from 'react'
import { Keyboard } from 'react-native'

import { LiquidGlassButton } from '@/componentsV2/base/LiquidGlassButton'
import { Plus } from '@/componentsV2/icons/LucideIcon'

import { presentToolSheet } from '../../../Sheet/ToolSheet'
import { useMessageInput } from '../context/MessageInputContext'

export const MessageInputToolButton: React.FC = () => {
  const { mentions, files, setFiles, assistant, updateAssistant } = useMessageInput()

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
