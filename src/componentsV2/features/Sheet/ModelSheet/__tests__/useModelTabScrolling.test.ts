import { act, renderHook } from '@testing-library/react-native'

import type { Provider } from '@/types/assistant'

import { useModelTabScrolling } from '../hooks/useModelTabScrolling'
import type { ProviderSection } from '../types'

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
    const { result, rerender } = renderHook<ReturnType<typeof useModelTabScrolling>, { isVisible: boolean }>(
      ({ isVisible }) => useModelTabScrolling({ sections, isVisible }),
      {
        initialProps: { isVisible: true }
      }
    )

    act(() => {
      result.current.handleProviderChange('Provider B')
    })

    rerender({ isVisible: false })

    expect(result.current.activeProvider).toBe('')
  })

  it('handles empty sections without crashing', () => {
    const emptySections: ProviderSection[] = []

    const { result } = renderHook(() => useModelTabScrolling({ sections: emptySections, isVisible: true }))

    expect(result.current.activeProvider).toBe('')

    act(() => {
      result.current.handleProviderChange('Nonexistent')
    })

    expect(result.current.activeProvider).toBe('Nonexistent')
  })

  it('handles provider change to nonexistent section gracefully', () => {
    const { result } = renderHook(() => useModelTabScrolling({ sections, isVisible: true }))
    const scrollToLocation = jest.fn()

    act(() => {
      result.current.listRef.current = { scrollToLocation } as any
    })

    act(() => {
      result.current.handleProviderChange('Nonexistent Provider')
    })

    expect(scrollToLocation).not.toHaveBeenCalled()
    expect(result.current.activeProvider).toBe('Nonexistent Provider')
  })

  it('does not update activeProvider when viewable items is empty', () => {
    const { result } = renderHook(() => useModelTabScrolling({ sections, isVisible: true }))

    act(() => {
      result.current.handleProviderChange('Provider A')
    })

    act(() => {
      result.current.onViewableItemsChanged({
        viewableItems: [],
        changed: []
      })
    })

    expect(result.current.activeProvider).toBe('Provider A')
  })

  it('handles null listRef gracefully when changing provider', () => {
    const { result } = renderHook(() => useModelTabScrolling({ sections, isVisible: true }))

    expect(result.current.listRef.current).toBeNull()

    act(() => {
      result.current.handleProviderChange('Provider A')
    })

    act(() => {
      jest.runAllTimers()
    })

    expect(result.current.activeProvider).toBe('Provider A')
  })
})
