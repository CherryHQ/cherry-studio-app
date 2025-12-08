import { useState } from 'react'
import { InteractionManager } from 'react-native'

import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

import type { AIFeatureType, ToolOperationResult, ToolSheetError } from '../types'

const logger = loggerService.withContext('AI Feature Handler')

interface UseAIFeatureHandlerProps {
  assistant: Assistant | null
  updateAssistant: ((assistant: Assistant) => Promise<void>) | null
  onSuccess?: () => void
}

interface UseAIFeatureHandlerReturn {
  handleEnableGenerateImage: () => Promise<ToolOperationResult>
  handleEnableWebSearch: () => Promise<ToolOperationResult>
  isLoading: boolean
  error: ToolSheetError | null
  clearError: () => void
}

export function useAIFeatureHandler({
  assistant,
  updateAssistant,
  onSuccess
}: UseAIFeatureHandlerProps): UseAIFeatureHandlerReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ToolSheetError | null>(null)

  const clearError = () => setError(null)

  const handleAiFeatureChange = async (value: AIFeatureType): Promise<ToolOperationResult> => {
    if (!assistant || !updateAssistant) {
      const err: ToolSheetError = {
        type: 'ai_feature',
        message: 'Assistant or updateAssistant is not available',
        translationKey: 'error.ai_feature.not_available'
      }
      setError(err)
      return { success: false, error: err }
    }

    setIsLoading(true)
    setError(null)

    try {
      const updatedAssistant = {
        ...assistant,
        enableGenerateImage: value === 'generateImage',
        enableWebSearch: value === 'webSearch'
      }

      await updateAssistant(updatedAssistant)

      // Use InteractionManager instead of delay hack
      // This ensures onSuccess is called after animations complete
      InteractionManager.runAfterInteractions(() => {
        onSuccess?.()
      })

      return { success: true }
    } catch (err) {
      logger.error('Error updating AI feature:', err)
      const error: ToolSheetError = {
        type: 'ai_feature',
        message: err instanceof Error ? err.message : 'Unknown error',
        translationKey: 'error.ai_feature.update_failed'
      }
      setError(error)
      return { success: false, error }
    } finally {
      setIsLoading(false)
    }
  }

  const handleEnableGenerateImage = async (): Promise<ToolOperationResult> => {
    const newValue: AIFeatureType = assistant?.enableGenerateImage ? 'none' : 'generateImage'
    return handleAiFeatureChange(newValue)
  }

  const handleEnableWebSearch = async (): Promise<ToolOperationResult> => {
    const newValue: AIFeatureType = assistant?.enableWebSearch ? 'none' : 'webSearch'
    return handleAiFeatureChange(newValue)
  }

  return {
    handleEnableGenerateImage,
    handleEnableWebSearch,
    isLoading,
    error,
    clearError
  }
}
