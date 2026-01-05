import { act, renderHook } from '@testing-library/react-native'

import { useVoiceInput } from '../../hooks/useVoiceInput'

describe('useVoiceInput', () => {
  it('initializes as inactive', () => {
    const { result } = renderHook(() => useVoiceInput())

    expect(result.current.isVoiceActive).toBe(false)
  })

  it('sets voice active state to true', () => {
    const { result } = renderHook(() => useVoiceInput())

    act(() => {
      result.current.setIsVoiceActive(true)
    })

    expect(result.current.isVoiceActive).toBe(true)
  })

  it('sets voice active state to false', () => {
    const { result } = renderHook(() => useVoiceInput())

    act(() => {
      result.current.setIsVoiceActive(true)
    })
    act(() => {
      result.current.setIsVoiceActive(false)
    })

    expect(result.current.isVoiceActive).toBe(false)
  })

  it('toggles voice state from inactive to active', () => {
    const { result } = renderHook(() => useVoiceInput())

    act(() => {
      result.current.toggleVoice()
    })

    expect(result.current.isVoiceActive).toBe(true)
  })

  it('toggles voice state from active to inactive', () => {
    const { result } = renderHook(() => useVoiceInput())

    act(() => {
      result.current.setIsVoiceActive(true)
    })
    act(() => {
      result.current.toggleVoice()
    })

    expect(result.current.isVoiceActive).toBe(false)
  })

  it('toggles multiple times correctly', () => {
    const { result } = renderHook(() => useVoiceInput())

    act(() => {
      result.current.toggleVoice()
    })
    expect(result.current.isVoiceActive).toBe(true)

    act(() => {
      result.current.toggleVoice()
    })
    expect(result.current.isVoiceActive).toBe(false)

    act(() => {
      result.current.toggleVoice()
    })
    expect(result.current.isVoiceActive).toBe(true)
  })
})
