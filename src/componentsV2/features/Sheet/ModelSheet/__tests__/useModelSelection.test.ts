import type { Model } from '@/types/assistant'

import { selectionReducer } from '../hooks/selectionReducer'

// Mock getModelUniqId
jest.mock('@/utils/model', () => ({
  getModelUniqId: (model: Model) => `${model.provider}:${model.id}`
}))

describe('selectionReducer', () => {
  const initialState = {
    selectedModels: [],
    isMultiSelectActive: false
  }

  describe('TOGGLE_MODEL in single-select mode', () => {
    it('should select a model and signal dismiss', () => {
      const result = selectionReducer(initialState, { type: 'TOGGLE_MODEL', modelValue: 'model-1' })

      expect(result.selectedModels).toEqual(['model-1'])
      expect(result.shouldDismiss).toBe(true)
    })

    it('should deselect a model and signal dismiss', () => {
      const state = { ...initialState, selectedModels: ['model-1'] }
      const result = selectionReducer(state, { type: 'TOGGLE_MODEL', modelValue: 'model-1' })

      expect(result.selectedModels).toEqual([])
      expect(result.shouldDismiss).toBe(true)
    })

    it('should replace selection when selecting different model', () => {
      const state = { ...initialState, selectedModels: ['model-1'] }
      const result = selectionReducer(state, { type: 'TOGGLE_MODEL', modelValue: 'model-2' })

      expect(result.selectedModels).toEqual(['model-2'])
      expect(result.shouldDismiss).toBe(true)
    })
  })

  describe('TOGGLE_MODEL in multi-select mode', () => {
    const multiSelectState = { selectedModels: [], isMultiSelectActive: true }

    it('should add model to selection without dismiss', () => {
      const result = selectionReducer(multiSelectState, { type: 'TOGGLE_MODEL', modelValue: 'model-1' })

      expect(result.selectedModels).toEqual(['model-1'])
      expect(result.shouldDismiss).toBeUndefined()
    })

    it('should remove model from selection', () => {
      const state = { ...multiSelectState, selectedModels: ['model-1', 'model-2'] }
      const result = selectionReducer(state, { type: 'TOGGLE_MODEL', modelValue: 'model-1' })

      expect(result.selectedModels).toEqual(['model-2'])
    })

    it('should add multiple models', () => {
      const state1 = selectionReducer(multiSelectState, { type: 'TOGGLE_MODEL', modelValue: 'model-1' })
      const state2 = selectionReducer(state1, { type: 'TOGGLE_MODEL', modelValue: 'model-2' })

      expect(state2.selectedModels).toEqual(['model-1', 'model-2'])
    })
  })

  describe('CLEAR_ALL', () => {
    it('should clear all selections', () => {
      const state = { selectedModels: ['model-1', 'model-2'], isMultiSelectActive: true }
      const result = selectionReducer(state, { type: 'CLEAR_ALL' })

      expect(result.selectedModels).toEqual([])
      expect(result.isMultiSelectActive).toBe(true) // Mode unchanged
    })
  })

  describe('TOGGLE_MULTI_SELECT', () => {
    it('should enable multi-select mode', () => {
      const result = selectionReducer(initialState, { type: 'TOGGLE_MULTI_SELECT' })

      expect(result.isMultiSelectActive).toBe(true)
    })

    it('should disable multi-select mode', () => {
      const state = { selectedModels: ['model-1'], isMultiSelectActive: true }
      const result = selectionReducer(state, { type: 'TOGGLE_MULTI_SELECT' })

      expect(result.isMultiSelectActive).toBe(false)
    })

    it('should keep only first selection when switching to single-select with multiple selections', () => {
      const state = { selectedModels: ['model-1', 'model-2', 'model-3'], isMultiSelectActive: true }
      const result = selectionReducer(state, { type: 'TOGGLE_MULTI_SELECT' })

      expect(result.isMultiSelectActive).toBe(false)
      expect(result.selectedModels).toEqual(['model-1'])
    })

    it('should preserve single selection when switching to single-select', () => {
      const state = { selectedModels: ['model-1'], isMultiSelectActive: true }
      const result = selectionReducer(state, { type: 'TOGGLE_MULTI_SELECT' })

      expect(result.selectedModels).toEqual(['model-1'])
    })
  })

  describe('SYNC_MENTIONS', () => {
    it('should sync selection from mentions and enable multi-select for multiple mentions', () => {
      const mentions = [
        { id: 'gpt-4', provider: 'openai' } as Model,
        { id: 'claude-3', provider: 'anthropic' } as Model
      ]
      const result = selectionReducer(initialState, { type: 'SYNC_MENTIONS', mentions })

      expect(result.selectedModels).toEqual(['openai:gpt-4', 'anthropic:claude-3'])
      expect(result.isMultiSelectActive).toBe(true)
    })

    it('should disable multi-select for single mention', () => {
      const state = { selectedModels: ['model-1', 'model-2'], isMultiSelectActive: true }
      const mentions = [{ id: 'gpt-4', provider: 'openai' } as Model]
      const result = selectionReducer(state, { type: 'SYNC_MENTIONS', mentions })

      expect(result.selectedModels).toEqual(['openai:gpt-4'])
      expect(result.isMultiSelectActive).toBe(false)
    })

    it('should handle empty mentions', () => {
      const state = { selectedModels: ['model-1'], isMultiSelectActive: true }
      const result = selectionReducer(state, { type: 'SYNC_MENTIONS', mentions: [] })

      expect(result.selectedModels).toEqual([])
      expect(result.isMultiSelectActive).toBe(false)
    })
  })
})
