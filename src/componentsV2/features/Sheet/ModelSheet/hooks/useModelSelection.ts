import { useCallback, useEffect, useReducer } from 'react'
import { InteractionManager } from 'react-native'

import type { Model } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

import { mapSelectionToMentions } from '../modelSheetData'
import type { ModelOption } from '../types'
import { selectionReducer, type SelectionState } from './selectionReducer'
import { dismissModelSheet } from './useModelSheetData'

interface UseModelSelectionParams {
  mentions: Model[]
  allModelOptions: ModelOption[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void> | void
}

/**
 * Compute new state and side effects for model toggle action.
 * Pure function to avoid duplicate reducer calls.
 */
function computeToggleResult(state: SelectionState, modelValue: string) {
  const isSelected = state.selectedModels.includes(modelValue)

  if (state.isMultiSelectActive) {
    const newSelection = isSelected
      ? state.selectedModels.filter(id => id !== modelValue)
      : [...state.selectedModels, modelValue]
    return { newSelection, shouldDismiss: false }
  } else {
    const newSelection = isSelected ? [] : [modelValue]
    return { newSelection, shouldDismiss: true }
  }
}

/**
 * Compute new state for toggle multi-select mode action.
 * Pure function to avoid duplicate reducer calls.
 */
function computeMultiSelectToggleResult(state: SelectionState) {
  const newMultiSelectActive = !state.isMultiSelectActive
  // If switching to single-select with multiple selections, keep only first
  if (!newMultiSelectActive && state.selectedModels.length > 1) {
    return { newSelection: [state.selectedModels[0]], newMultiSelectActive }
  }
  return { newSelection: state.selectedModels, newMultiSelectActive }
}

export function useModelSelection({ mentions, allModelOptions, setMentions }: UseModelSelectionParams) {
  const [state, dispatch] = useReducer(selectionReducer, {
    selectedModels: mentions.map(m => getModelUniqId(m)),
    isMultiSelectActive: mentions.length > 1
  })

  // Sync with external mentions
  useEffect(() => {
    dispatch({ type: 'SYNC_MENTIONS', mentions })
  }, [mentions])

  // Commit selection to parent
  const commitSelection = useCallback(
    (selection: string[], isMultiSelectActive: boolean) => {
      const newMentions = mapSelectionToMentions(selection, allModelOptions)
      InteractionManager.runAfterInteractions(async () => {
        await Promise.resolve(setMentions(newMentions, isMultiSelectActive))
      })
    },
    [allModelOptions, setMentions]
  )

  const handleModelToggle = useCallback(
    (modelValue: string) => {
      // Compute result first (pure function, no side effects)
      const { newSelection, shouldDismiss } = computeToggleResult(state, modelValue)

      // Dispatch state update
      dispatch({ type: 'TOGGLE_MODEL', modelValue })

      // Handle side effects after dispatch
      if (shouldDismiss) {
        dismissModelSheet()
      }

      // Commit selection to parent
      commitSelection(newSelection, state.isMultiSelectActive)
    },
    [state, commitSelection]
  )

  const handleClearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
    setMentions([])
  }, [setMentions])

  const toggleMultiSelectMode = useCallback(() => {
    // Compute result first (pure function, no side effects)
    const { newSelection, newMultiSelectActive } = computeMultiSelectToggleResult(state)

    // Dispatch state update
    dispatch({ type: 'TOGGLE_MULTI_SELECT' })

    // If selection changed (trimmed to first), commit it
    if (newSelection.length !== state.selectedModels.length) {
      commitSelection(newSelection, newMultiSelectActive)
    }
  }, [state, commitSelection])

  return {
    selectedModels: state.selectedModels,
    isMultiSelectActive: state.isMultiSelectActive,
    handleModelToggle,
    handleClearAll,
    toggleMultiSelectMode
  }
}
