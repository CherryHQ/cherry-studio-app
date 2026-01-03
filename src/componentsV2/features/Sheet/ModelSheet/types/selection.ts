/**
 * Selection state - what is currently selected
 */
export interface SelectionState {
  selectedModels: string[]
  isMultiSelectActive: boolean
}

/**
 * Selection actions - how to modify selection
 */
export interface SelectionActions {
  handleModelToggle: (modelValue: string) => Promise<void>
  handleClearAll: () => Promise<void>
  toggleMultiSelectMode: () => Promise<void>
}

/**
 * Combined selection interface
 */
export type Selection = SelectionState & SelectionActions
