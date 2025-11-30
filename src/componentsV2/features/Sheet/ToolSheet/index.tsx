import { TrueSheet } from '@lodev09/react-native-true-sheet'
import React, { useEffect, useState } from 'react'
import { BackHandler, View } from 'react-native'

import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import type { Assistant, Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

import { useCameraModal } from './CameraModal'
import { ExternalTools } from './ExternalTools'
import { SystemTools } from './SystemTools'
import { useAIFeatureHandler } from './useAIFeatureHandler'
import { useFileHandler } from './useFileHandler'

export const TOOL_SHEET_NAME = 'tool-sheet'
export const presentToolSheet = () => TrueSheet.present(TOOL_SHEET_NAME)
export const dismissToolSheet = () => TrueSheet.dismiss(TOOL_SHEET_NAME)

interface ToolSheetProps {
  mentions: Model[]
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const ToolSheet: React.FC<ToolSheetProps> = ({ mentions, files, setFiles, assistant, updateAssistant }) => {
  const bottom = useBottom()
  const [isVisible, setIsVisible] = useState(false)

  const dismissSheet = () => {
    TrueSheet.dismiss(TOOL_SHEET_NAME)
  }

  const { handleAddImage, handleAddFile, handleAddPhotoFromCamera } = useFileHandler({
    files,
    setFiles,
    onSuccess: dismissSheet
  })

  const { handleEnableGenerateImage, handleEnableWebSearch } = useAIFeatureHandler({
    assistant,
    updateAssistant,
    onSuccess: dismissSheet
  })

  const cameraModal = useCameraModal({
    onPhotoTaken: handleAddPhotoFromCamera,
    onSuccess: dismissSheet
  })

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      TrueSheet.dismiss(TOOL_SHEET_NAME)
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleCameraPress = () => {
    dismissSheet()
    cameraModal.handleOpenCamera()
  }

  return (
    <>
      <TrueSheet
        name={TOOL_SHEET_NAME}
        detents={['auto']}
        cornerRadius={30}
        grabber
        dismissible
        dimmed
        onDidDismiss={() => setIsVisible(false)}
        onDidPresent={() => setIsVisible(true)}>
        <View style={{ paddingBottom: bottom }}>
          <YStack className="gap-3 pt-5">
            <SystemTools onCameraPress={handleCameraPress} onImagePress={handleAddImage} onFilePress={handleAddFile} />
            <ExternalTools
              mentions={mentions}
              assistant={assistant}
              onWebSearchToggle={handleEnableWebSearch}
              onGenerateImageToggle={handleEnableGenerateImage}
            />
          </YStack>
        </View>
      </TrueSheet>

      {cameraModal.modal}
    </>
  )
}
