import { act, renderHook, waitFor } from '@testing-library/react-native'

import { useAllProviders } from '@/hooks/useProviders'

import { createMockAssistant, createMockModel, createMockProvider } from '../../__mocks__/testData'
import type { UseMentionsOptions } from '../../hooks/useMentions'
import { useMentions } from '../../hooks/useMentions'
import { getInitialMentions, handleModelChange, validateMentions } from '../../services'

jest.mock('@/hooks/useProviders', () => ({
  useAllProviders: jest.fn()
}))

jest.mock('../../services', () => ({
  getInitialMentions: jest.fn(),
  handleModelChange: jest.fn(),
  validateMentions: jest.fn()
}))

const mockUseAllProviders = useAllProviders as jest.MockedFunction<typeof useAllProviders>
const mockGetInitialMentions = getInitialMentions as jest.MockedFunction<typeof getInitialMentions>
const mockHandleModelChange = handleModelChange as jest.MockedFunction<typeof handleModelChange>
const mockValidateMentions = validateMentions as jest.MockedFunction<typeof validateMentions>

const createMockProviderReturn = (overrides = {}) => ({
  providers: [createMockProvider()],
  isLoading: false,
  updateProviders: jest.fn().mockResolvedValue(undefined),
  ...overrides
})

describe('useMentions', () => {
  const defaultProps: UseMentionsOptions = {
    topicId: 'topic-1',
    assistant: createMockAssistant(),
    updateAssistant: jest.fn().mockResolvedValue(undefined)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAllProviders.mockReturnValue(createMockProviderReturn())
    mockGetInitialMentions.mockReturnValue([])
    mockValidateMentions.mockReturnValue({
      validMentions: [],
      removedCount: 0
    })
    mockHandleModelChange.mockResolvedValue({ success: true })
  })

  describe('initialization', () => {
    it('initializes with empty mentions', () => {
      const { result } = renderHook(() => useMentions(defaultProps))

      expect(result.current.mentions).toEqual([])
    })

    it('calls getInitialMentions on mount', () => {
      renderHook(() => useMentions(defaultProps))

      expect(mockGetInitialMentions).toHaveBeenCalledWith(defaultProps.assistant)
    })

    it('initializes mentions from getInitialMentions', () => {
      const model = createMockModel({ id: 'initial-model' })
      mockGetInitialMentions.mockReturnValue([model])

      const { result } = renderHook(() => useMentions(defaultProps))

      expect(result.current.mentions).toEqual([model])
    })
  })

  describe('topic change', () => {
    it('reinitializes mentions when topicId changes', () => {
      const model1 = createMockModel({ id: 'model-1' })
      const model2 = createMockModel({ id: 'model-2' })

      mockGetInitialMentions.mockReturnValueOnce([model1]).mockReturnValueOnce([model2])

      const { result, rerender } = renderHook((props: UseMentionsOptions) => useMentions(props), {
        initialProps: defaultProps
      })

      expect(result.current.mentions).toEqual([model1])

      rerender({ ...defaultProps, topicId: 'topic-2' })

      expect(result.current.mentions).toEqual([model2])
    })
  })

  describe('mention validation', () => {
    it('validates mentions against providers', async () => {
      const model = createMockModel({ id: 'model-1' })
      const provider = createMockProvider({ models: [model] })

      mockGetInitialMentions.mockReturnValue([model])
      mockUseAllProviders.mockReturnValue(createMockProviderReturn({ providers: [provider] }))
      mockValidateMentions.mockReturnValue({
        validMentions: [model],
        removedCount: 0
      })

      renderHook(() => useMentions(defaultProps))

      await waitFor(() => {
        expect(mockValidateMentions).toHaveBeenCalled()
      })
    })

    it('removes invalid mentions', async () => {
      const validModel = createMockModel({ id: 'valid-model' })
      const invalidModel = createMockModel({ id: 'invalid-model' })
      const provider = createMockProvider({ models: [validModel] })

      mockGetInitialMentions.mockReturnValue([validModel, invalidModel])
      mockUseAllProviders.mockReturnValue(createMockProviderReturn({ providers: [provider] }))
      mockValidateMentions.mockReturnValue({
        validMentions: [validModel],
        removedCount: 1
      })

      const { result } = renderHook(() => useMentions(defaultProps))

      await waitFor(() => {
        expect(result.current.mentions).toEqual([validModel])
      })
    })

    it('skips validation when loading', () => {
      const model = createMockModel({ id: 'model-1' })
      mockGetInitialMentions.mockReturnValue([model])
      mockUseAllProviders.mockReturnValue(createMockProviderReturn({ providers: [], isLoading: true }))

      renderHook(() => useMentions(defaultProps))

      expect(mockValidateMentions).not.toHaveBeenCalled()
    })

    it('skips validation when mentions empty', () => {
      mockGetInitialMentions.mockReturnValue([])
      mockUseAllProviders.mockReturnValue(createMockProviderReturn())

      renderHook(() => useMentions(defaultProps))

      expect(mockValidateMentions).not.toHaveBeenCalled()
    })

    it('does not update mentions when no removals', async () => {
      const model = createMockModel({ id: 'model-1' })

      mockGetInitialMentions.mockReturnValue([model])
      mockUseAllProviders.mockReturnValue(createMockProviderReturn())
      mockValidateMentions.mockReturnValue({
        validMentions: [model],
        removedCount: 0
      })

      const { result } = renderHook(() => useMentions(defaultProps))

      await waitFor(() => {
        expect(mockValidateMentions).toHaveBeenCalled()
      })

      // Original mention should still be there
      expect(result.current.mentions).toEqual([model])
    })
  })

  describe('handleMentionChange', () => {
    it('updates mentions state', async () => {
      const newModels = [createMockModel({ id: 'new-model' })]
      const { result } = renderHook(() => useMentions(defaultProps))

      await act(async () => {
        await result.current.handleMentionChange(newModels)
      })

      expect(result.current.mentions).toEqual(newModels)
    })

    it('calls handleModelChange service', async () => {
      const newModels = [createMockModel({ id: 'new-model' })]
      const { result } = renderHook(() => useMentions(defaultProps))

      await act(async () => {
        await result.current.handleMentionChange(newModels)
      })

      expect(mockHandleModelChange).toHaveBeenCalledWith(
        newModels,
        defaultProps.assistant,
        defaultProps.updateAssistant
      )
    })

    it('handles empty models array', async () => {
      const { result } = renderHook(() => useMentions(defaultProps))

      await act(async () => {
        await result.current.handleMentionChange([])
      })

      expect(result.current.mentions).toEqual([])
      expect(mockHandleModelChange).toHaveBeenCalledWith([], expect.any(Object), expect.any(Function))
    })

    it('handles multiple models', async () => {
      const models = [createMockModel({ id: 'model-1' }), createMockModel({ id: 'model-2' })]
      const { result } = renderHook(() => useMentions(defaultProps))

      await act(async () => {
        await result.current.handleMentionChange(models)
      })

      expect(result.current.mentions).toEqual(models)
    })
  })

  describe('setMentions', () => {
    it('allows direct setting of mentions', () => {
      const models = [createMockModel({ id: 'model-1' })]
      const { result } = renderHook(() => useMentions(defaultProps))

      act(() => {
        result.current.setMentions(models)
      })

      expect(result.current.mentions).toEqual(models)
    })

    it('allows functional update of mentions', () => {
      const model1 = createMockModel({ id: 'model-1' })
      const model2 = createMockModel({ id: 'model-2' })
      mockGetInitialMentions.mockReturnValue([model1])

      const { result } = renderHook(() => useMentions(defaultProps))

      act(() => {
        result.current.setMentions(prev => [...prev, model2])
      })

      expect(result.current.mentions).toHaveLength(2)
    })
  })
})
