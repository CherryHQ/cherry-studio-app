import { act, renderHook, waitFor } from '@testing-library/react-native'

import type { Model } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

import type { ModelOption } from '../types'
import { useModelSelection } from '../hooks/useModelSelection'

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
})
