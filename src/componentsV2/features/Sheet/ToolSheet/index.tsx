import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import React, { forwardRef, useEffect, useState } from 'react'
import { BackHandler } from 'react-native'

import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import { useTheme } from '@/hooks/useTheme'
import type { Assistant, Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

import { useCameraModal } from './CameraModal'
import { ExternalTools } from './ExternalTools'
import { SystemTools } from './SystemTools'
import { useAIFeatureHandler } from './useAIFeatureHandler'
import { useFileHandler } from './useFileHandler'

interface ToolSheetProps {
  mentions: Model[]
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const ToolSheet = forwardRef<BottomSheetModal, ToolSheetProps>(
  ({ mentions, files, setFiles, assistant, updateAssistant }, ref) => {
    const { isDark } = useTheme()
    const bottom = useBottom()
    const [isVisible, setIsVisible] = useState(false)

    const dismissSheet = () => {
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
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
        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
        return true
      }

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
      return () => backHandler.remove()
    }, [ref, isVisible])

    const handleCameraPress = () => {
      dismissSheet()
      cameraModal.handleOpenCamera()
    }

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
    )

    return (
      <>
        <BottomSheetModal
          enableDynamicSizing={true}
          ref={ref}
          backgroundStyle={{
            borderRadius: 30,
            backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
          }}
          handleIndicatorStyle={{
            backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
          }}
          backdropComponent={renderBackdrop}
          onDismiss={() => setIsVisible(false)}
          onChange={index => setIsVisible(index >= 0)}>
          <BottomSheetView style={{ paddingBottom: bottom }}>
            <YStack className="gap-3">
              <SystemTools
                onCameraPress={handleCameraPress}
                onImagePress={handleAddImage}
                onFilePress={handleAddFile}
              />
              <ExternalTools
                mentions={mentions}
                assistant={assistant}
                onWebSearchToggle={handleEnableWebSearch}
                onGenerateImageToggle={handleEnableGenerateImage}
              />
            </YStack>
          </BottomSheetView>
        </BottomSheetModal>

        {cameraModal.modal}
      </>
    )
  }
)

ToolSheet.displayName = 'ToolSheet'
