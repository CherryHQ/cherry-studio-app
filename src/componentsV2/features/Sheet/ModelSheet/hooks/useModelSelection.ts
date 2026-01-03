import { useEffect, useState } from 'react'
import { InteractionManager } from 'react-native'

import type { Model } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

import type { ModelOption, Selection } from '../types'

interface UseModelSelectionParams {
  mentions: Model[]
  allModelOptions: ModelOption[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void> | void
  onDismiss: () => void // Dependency injection instead of direct import
}

/**
 * Hook for managing model selection state
 * Supports both single-select and multi-select modes
 */
export function useModelSelection({
  mentions,
  allModelOptions,
  setMentions,
  onDismiss
}: UseModelSelectionParams): Selection {
  const [selectedModels, setSelectedModels] = useState<string[]>(() => mentions.map(m => getModelUniqId(m)))
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)

  useEffect(() => {
    setSelectedModels(mentions.map(m => getModelUniqId(m)))
  }, [mentions])

  const handleModelToggle = async (modelValue: string) => {
    const isSelected = selectedModels.includes(modelValue)
    let newSelection: string[]

    if (isMultiSelectActive) {
      // Multi-select mode: toggle selection
      if (!isSelected) {
        newSelection = [...selectedModels, modelValue]
      } else {
        newSelection = selectedModels.filter(id => id !== modelValue)
      }
    } else {
      // Single-select mode: select and dismiss
      if (!isSelected) {
        newSelection = [modelValue]
      } else {
        newSelection = []
      }
      // Use injected dependency instead of direct import
      onDismiss()
    }

    setSelectedModels(newSelection)

    const newMentions = allModelOptions
      .filter(option => newSelection.includes(option.value))
      .map(option => option.model)
    InteractionManager.runAfterInteractions(async () => {
      await Promise.resolve(setMentions(newMentions, isMultiSelectActive))
    })
  }

  const handleClearAll = async () => {
    setSelectedModels([])
    await Promise.resolve(setMentions([]))
  }

  const toggleMultiSelectMode = async () => {
    const newMultiSelectActive = !isMultiSelectActive
    setIsMultiSelectActive(newMultiSelectActive)

    // If switching to single-select mode and multiple selections exist, keep only the first
    if (!newMultiSelectActive && selectedModels.length > 1) {
      const firstSelected = selectedModels[0]
      setSelectedModels([firstSelected])
      const newMentions = allModelOptions.filter(option => option.value === firstSelected).map(option => option.model)
      await Promise.resolve(setMentions(newMentions))
    }
  }

  return {
    selectedModels,
    isMultiSelectActive,
    handleModelToggle,
    handleClearAll,
    toggleMultiSelectMode
  }
}
