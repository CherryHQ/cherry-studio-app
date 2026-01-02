import { act, renderHook } from '@testing-library/react-native'

import type { Provider } from '@/types/assistant'

import type { ProviderSection } from '../types'
import { useModelTabScrolling } from '../hooks/useModelTabScrolling'

const buildProvider = (id: string, name: string): Provider => ({
  id,
  type: 'openai',
  name,
  apiKey: '',
  apiHost: '',
  models: []
})

const sections: ProviderSection[] = [
  { title: 'Provider A', provider: buildProvider('provider-a', 'Provider A'), data: [] },
  { title: 'Provider B', provider: buildProvider('provider-b', 'Provider B'), data: [] }
]

describe('useModelTabScrolling', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('scrolls to section when provider tab clicked', () => {
    const { result } = renderHook(() => useModelTabScrolling({ sections, isVisible: true }))
    const scrollToLocation = jest.fn()

    act(() => {
      result.current.listRef.current = { scrollToLocation } as any
    })

    act(() => {
      result.current.handleProviderChange('Provider A')
    })

    expect(scrollToLocation).toHaveBeenCalledWith({
      sectionIndex: 0,
      itemIndex: 0,
      animated: true
    })
    expect(result.current.activeProvider).toBe('Provider A')

    act(() => {
      jest.runAllTimers()
    })
  })

  it('updates activeProvider when viewable items change', () => {
    const { result } = renderHook(() => useModelTabScrolling({ sections, isVisible: true }))

    act(() => {
      result.current.onViewableItemsChanged({
        viewableItems: [{ section: sections[1] } as any],
        changed: []
      })
    })

    expect(result.current.activeProvider).toBe('Provider B')
  })

  it('resets activeProvider when sheet is dismissed', () => {
    const { result, rerender } = renderHook(
      ({ isVisible }) => useModelTabScrolling({ sections, isVisible }),
      { initialProps: { isVisible: true } }
    )

    act(() => {
      result.current.handleProviderChange('Provider B')
    })

    rerender({ isVisible: false })

    expect(result.current.activeProvider).toBe('')
  })
})
