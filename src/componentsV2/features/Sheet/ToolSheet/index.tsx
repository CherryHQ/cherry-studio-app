import { TrueSheet } from '@lodev09/react-native-true-sheet'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, View } from 'react-native'

import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { isIOS26 } from '@/utils/device'

import { presentWebSearchProviderSheet } from '../WebSearchProviderSheet'
import { ExternalTools } from './ExternalTools'
import {
  dismissToolSheet,
  presentToolSheet,
  TOOL_SHEET_NAME,
  useAIFeatureHandler,
  useFileHandler,
  useToolSheetData
} from './hooks'
import { SystemTools } from './SystemTools'

export { dismissToolSheet, presentToolSheet, TOOL_SHEET_NAME }
export type { ToolSheetData } from './types'

export const ToolSheet: React.FC = () => {
  const { t } = useTranslation()
  const bottom = useBottom()
  const { isDark } = useTheme()
  const toast = useToast()

  const { sheetData, isVisible, handleDidDismiss, handleDidPresent } = useToolSheetData()
  const { mentions, files, setFiles, assistant, updateAssistant } = sheetData

  const {
    handleAddImage,
    handleAddFile,
    handleTakePhoto,
    loadingState: fileLoadingState,
    error: fileError,
    clearError: clearFileError
  } = useFileHandler({
    files,
    setFiles,
    onSuccess: dismissToolSheet
  })

  const {
    handleEnableGenerateImage,
    handleEnableWebSearch,
    isLoading: isAIFeatureLoading,
    error: aiError,
    clearError: clearAIError
  } = useAIFeatureHandler({
    assistant,
    updateAssistant,
    onSuccess: dismissToolSheet
  })

  // Display errors via toast
  useEffect(() => {
    const error = fileError || aiError
    if (error) {
      const message = error.translationKey ? t(error.translationKey) : error.message
      toast.show(message)
      clearFileError()
      clearAIError()
    }
  }, [fileError, aiError, t, toast, clearFileError, clearAIError])

  // Handle Android back button
  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissToolSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleWebSearchSwitchPress = () => {
    dismissToolSheet()
    presentWebSearchProviderSheet({
      mentions,
      assistant,
      updateAssistant
    })
  }

  const handleCameraPress = () => {
    dismissToolSheet()
    handleTakePhoto()
  }

  return (
    <TrueSheet
      name={TOOL_SHEET_NAME}
      detents={['auto']}
      cornerRadius={30}
      grabber
      dismissible
      dimmed
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      onDidDismiss={handleDidDismiss}
      onDidPresent={handleDidPresent}
      style={{ paddingBottom: bottom + 10 }}>
      <View>
        <YStack className="gap-3 pt-5">
          <SystemTools
            onCameraPress={handleCameraPress}
            onImagePress={handleAddImage}
            onFilePress={handleAddFile}
            loadingState={fileLoadingState}
          />
          {assistant && updateAssistant && (
            <ExternalTools
              mentions={mentions}
              assistant={assistant}
              onWebSearchToggle={handleEnableWebSearch}
              onWebSearchSwitchPress={handleWebSearchSwitchPress}
              onGenerateImageToggle={handleEnableGenerateImage}
              isLoading={isAIFeatureLoading}
            />
          )}
        </YStack>
      </View>
    </TrueSheet>
  )
}
