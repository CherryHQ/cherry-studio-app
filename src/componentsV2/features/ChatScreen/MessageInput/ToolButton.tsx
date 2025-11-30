import React from 'react'
import { Keyboard } from 'react-native'

import { IconButton } from '@/componentsV2/base/IconButton'
import { AssetsIcon } from '@/componentsV2/icons'
import type { Assistant, Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

import { presentToolSheet, ToolSheet } from '../../Sheet/ToolSheet'

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
    presentToolSheet()
  }

  return (
    <>
      <IconButton icon={<AssetsIcon size={20} />} onPress={handlePress} />

      <ToolSheet
        mentions={mentions}
        files={files}
        setFiles={setFiles}
        assistant={assistant}
        updateAssistant={updateAssistant}
      />
    </>
  )
}
