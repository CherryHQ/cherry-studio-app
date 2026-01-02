import type { Model } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

// Action types
export type SelectionAction =
  | { type: 'TOGGLE_MODEL'; modelValue: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'TOGGLE_MULTI_SELECT' }
  | { type: 'SYNC_MENTIONS'; mentions: Model[] }

// State interface
export interface SelectionState {
  selectedModels: string[]
  isMultiSelectActive: boolean
}

// Result type includes optional side effect flag
export interface SelectionResult extends SelectionState {
  shouldDismiss?: boolean
}

/**
 * Pure reducer for model selection state.
 * Returns new state and optional side effect flag.
 */
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionResult {
  switch (action.type) {
    case 'TOGGLE_MODEL': {
      const { modelValue } = action
      const isSelected = state.selectedModels.includes(modelValue)

      if (state.isMultiSelectActive) {
        // Multi-select: toggle in array
        const newSelection = isSelected
          ? state.selectedModels.filter(id => id !== modelValue)
          : [...state.selectedModels, modelValue]
        return { ...state, selectedModels: newSelection }
      } else {
        // Single-select: replace or clear, then dismiss
        const newSelection = isSelected ? [] : [modelValue]
        return { ...state, selectedModels: newSelection, shouldDismiss: true }
      }
    }

    case 'CLEAR_ALL':
      return { ...state, selectedModels: [] }

    case 'TOGGLE_MULTI_SELECT': {
      const newMultiSelectActive = !state.isMultiSelectActive
      // If switching to single-select with multiple selections, keep only first
      if (!newMultiSelectActive && state.selectedModels.length > 1) {
        return {
          ...state,
          isMultiSelectActive: newMultiSelectActive,
          selectedModels: [state.selectedModels[0]]
        }
      }
      return { ...state, isMultiSelectActive: newMultiSelectActive }
    }

    case 'SYNC_MENTIONS':
      return {
        ...state,
        selectedModels: action.mentions.map(m => getModelUniqId(m)),
        isMultiSelectActive: action.mentions.length > 1
      }

    default:
      return state
  }
}
