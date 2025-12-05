import { TrueSheet } from '@lodev09/react-native-true-sheet'
import React, { useEffect, useState } from 'react'
import { BackHandler, View } from 'react-native'

import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import type { Assistant, Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

import { presentWebSearchProviderSheet } from '../WebSearchProviderSheet'
import { useCameraModal } from './CameraModal'
import { ExternalTools } from './ExternalTools'
import { SystemTools } from './SystemTools'
import { useAIFeatureHandler } from './useAIFeatureHandler'
import { useFileHandler } from './useFileHandler'

export const TOOL_SHEET_NAME = 'tool-sheet'

interface ToolSheetData {
  mentions: Model[]
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
  assistant: Assistant | null
  updateAssistant: ((assistant: Assistant) => Promise<void>) | null
}

const defaultToolSheetData: ToolSheetData = {
  mentions: [],
  files: [],
  setFiles: () => {},
  assistant: null,
  updateAssistant: null
}

let currentSheetData: ToolSheetData = defaultToolSheetData
let updateSheetDataCallback: ((data: ToolSheetData) => void) | null = null

export const presentToolSheet = (data: ToolSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(TOOL_SHEET_NAME)
}

export const dismissToolSheet = () => TrueSheet.dismiss(TOOL_SHEET_NAME)

export const ToolSheet: React.FC = () => {
  const [sheetData, setSheetData] = useState<ToolSheetData>(currentSheetData)
  const { mentions, files, setFiles, assistant, updateAssistant } = sheetData
  const bottom = useBottom()
  const [isVisible, setIsVisible] = useState(false)

  const dismissSheet = () => {
    TrueSheet.dismiss(TOOL_SHEET_NAME)
  }

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

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

  const handleWebSearchSwitchPress = () => {
    dismissSheet()
    presentWebSearchProviderSheet({
      mentions,
      assistant,
      updateAssistant
    })
  }

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissSheet()
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
        onDidPresent={() => setIsVisible(true)}
        style={{ paddingBottom: bottom + 10 }}>
        <View>
          <YStack className="gap-3 pt-5">
            <SystemTools onCameraPress={handleCameraPress} onImagePress={handleAddImage} onFilePress={handleAddFile} />
            {assistant && updateAssistant && (
              <ExternalTools
                mentions={mentions}
                assistant={assistant}
                onWebSearchToggle={handleEnableWebSearch}
                onWebSearchSwitchPress={handleWebSearchSwitchPress}
                onGenerateImageToggle={handleEnableGenerateImage}
              />
            )}
          </YStack>
        </View>
      </TrueSheet>

      {cameraModal.modal}
    </>
  )
}
