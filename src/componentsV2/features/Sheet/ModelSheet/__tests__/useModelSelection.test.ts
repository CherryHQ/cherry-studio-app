import { act, renderHook, waitFor } from '@testing-library/react-native'

import type { Model } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

import { useModelSelection } from '../hooks/useModelSelection'
import type { ModelOption, Selection } from '../types'

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native/jest/mock')
  return {
    ...actual,
    InteractionManager: {
      runAfterInteractions: (cb: () => unknown) => Promise.resolve().then(cb)
    }
  }
})

const buildModel = (id: string, provider: string, name: string): Model => ({
  id,
  provider,
  name,
  group: 'test'
})

const buildOption = (model: Model): ModelOption => ({
  label: model.name,
  value: getModelUniqId(model),
  model
})

describe('useModelSelection', () => {
  it('keeps existing selections when adding a visible item in multi-select mode', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Beta')
    const allModelOptions = [buildOption(modelA), buildOption(modelB)]
    const mentions = [modelB]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.toggleMultiSelectMode()
    })

    await act(async () => {
      await result.current.handleModelToggle(allModelOptions[0].value)
    })

    await waitFor(() => {
      expect(setMentions).toHaveBeenCalled()
    })

    expect(onDismiss).not.toHaveBeenCalled()
    expect(result.current.selectedModels).toEqual(
      expect.arrayContaining([allModelOptions[0].value, allModelOptions[1].value])
    )
    expect(setMentions).toHaveBeenLastCalledWith(expect.arrayContaining([modelA, modelB]), true)
  })

  it('dismisses sheet and updates mentions in single-select mode', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const allModelOptions = [buildOption(modelA)]
    const mentions: Model[] = []
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.handleModelToggle(allModelOptions[0].value)
    })

    await waitFor(() => {
      expect(setMentions).toHaveBeenCalled()
    })

    expect(onDismiss).toHaveBeenCalled()
    expect(setMentions).toHaveBeenLastCalledWith([modelA], false)
  })

  it('deselects already selected item in single-select mode', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const allModelOptions = [buildOption(modelA)]
    const mentions = [modelA]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.handleModelToggle(allModelOptions[0].value)
    })

    await waitFor(() => {
      expect(setMentions).toHaveBeenCalled()
    })

    expect(onDismiss).toHaveBeenCalled()
    expect(result.current.selectedModels).toEqual([])
    expect(setMentions).toHaveBeenLastCalledWith([], false)
  })

  it('deselects already selected item in multi-select mode', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Beta')
    const allModelOptions = [buildOption(modelA), buildOption(modelB)]
    const mentions = [modelA, modelB]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.toggleMultiSelectMode()
    })

    await act(async () => {
      await result.current.handleModelToggle(allModelOptions[0].value)
    })

    await waitFor(() => {
      expect(setMentions).toHaveBeenCalled()
    })

    expect(onDismiss).not.toHaveBeenCalled()
    expect(result.current.selectedModels).toEqual([allModelOptions[1].value])
  })

  it('keeps first selection when switching from multi to single with multiple selections', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Beta')
    const allModelOptions = [buildOption(modelA), buildOption(modelB)]
    const mentions = [modelA, modelB]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.toggleMultiSelectMode()
    })

    expect(result.current.isMultiSelectActive).toBe(true)

    await act(async () => {
      await result.current.toggleMultiSelectMode()
    })

    await waitFor(() => {
      expect(setMentions).toHaveBeenCalled()
    })

    expect(result.current.isMultiSelectActive).toBe(false)
    expect(result.current.selectedModels).toEqual([allModelOptions[0].value])
    expect(setMentions).toHaveBeenLastCalledWith([modelA])
  })

  it('preserves single selection when toggling multi-select mode', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const allModelOptions = [buildOption(modelA)]
    const mentions = [modelA]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.toggleMultiSelectMode()
    })

    expect(result.current.selectedModels).toEqual([allModelOptions[0].value])

    await act(async () => {
      await result.current.toggleMultiSelectMode()
    })

    expect(result.current.selectedModels).toEqual([allModelOptions[0].value])
  })

  it('clears all selections with handleClearAll', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Beta')
    const allModelOptions = [buildOption(modelA), buildOption(modelB)]
    const mentions = [modelA, modelB]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.handleClearAll()
    })

    expect(result.current.selectedModels).toEqual([])
    expect(setMentions).toHaveBeenLastCalledWith([])
  })

  it('syncs selectedModels when mentions prop changes', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Beta')
    const allModelOptions = [buildOption(modelA), buildOption(modelB)]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result, rerender } = renderHook<Selection, { mentions: Model[] }>(
      ({ mentions }) =>
        useModelSelection({
          mentions,
          allModelOptions,
          setMentions,
          onDismiss
        }),
      { initialProps: { mentions: [modelA] } }
    )

    expect(result.current.selectedModels).toEqual([allModelOptions[0].value])

    rerender({ mentions: [modelB] })

    expect(result.current.selectedModels).toEqual([allModelOptions[1].value])
  })

  it('handles empty allModelOptions gracefully', async () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const allModelOptions: ModelOption[] = []
    const mentions = [modelA]
    const setMentions = jest.fn()
    const onDismiss = jest.fn()

    const { result } = renderHook(() =>
      useModelSelection({
        mentions,
        allModelOptions,
        setMentions,
        onDismiss
      })
    )

    await act(async () => {
      await result.current.handleModelToggle('nonexistent')
    })

    await waitFor(() => {
      expect(setMentions).toHaveBeenCalled()
    })

    expect(setMentions).toHaveBeenLastCalledWith([], false)
  })
})
