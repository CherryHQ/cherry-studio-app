import { act, renderHook } from '@testing-library/react-native'
import type { TextInputContentSizeChangeEvent } from 'react-native'

import { useInputHeight } from '../../hooks/useInputHeight'
import { TEXT_FIELD_CONFIG } from '../../types'

const { LINE_HEIGHT, MAX_VISIBLE_LINES, MAX_INPUT_HEIGHT } = TEXT_FIELD_CONFIG

const createContentSizeEvent = (height: number): TextInputContentSizeChangeEvent =>
  ({
    nativeEvent: {
      contentSize: { height, width: 300 }
    }
  }) as TextInputContentSizeChangeEvent

describe('useInputHeight', () => {
  it('starts with undefined height', () => {
    const { result } = renderHook(() => useInputHeight())

    expect(result.current.inputHeight).toBeUndefined()
  })

  it('starts with expand button hidden', () => {
    const { result } = renderHook(() => useInputHeight())

    expect(result.current.showExpandButton).toBe(false)
  })

  it('updates height on content size change', () => {
    const { result } = renderHook(() => useInputHeight())

    act(() => {
      result.current.handleContentSizeChange(createContentSizeEvent(50))
    })

    expect(result.current.inputHeight).toBe(50)
  })

  it('caps at max height', () => {
    const { result } = renderHook(() => useInputHeight())
    const exceedingHeight = MAX_INPUT_HEIGHT + 100

    act(() => {
      result.current.handleContentSizeChange(createContentSizeEvent(exceedingHeight))
    })

    expect(result.current.inputHeight).toBe(MAX_INPUT_HEIGHT)
  })

  it('shows expand button when > 4 lines', () => {
    const { result } = renderHook(() => useInputHeight())
    // Height that exceeds 4 lines (LINE_HEIGHT * 4 + 1)
    const fiveLineHeight = LINE_HEIGHT * (MAX_VISIBLE_LINES + 1)

    act(() => {
      result.current.handleContentSizeChange(createContentSizeEvent(fiveLineHeight))
    })

    expect(result.current.showExpandButton).toBe(true)
  })

  it('hides expand button when <= 4 lines', () => {
    const { result } = renderHook(() => useInputHeight())
    // Height for exactly 4 lines
    const fourLineHeight = LINE_HEIGHT * MAX_VISIBLE_LINES

    act(() => {
      result.current.handleContentSizeChange(createContentSizeEvent(fourLineHeight))
    })

    expect(result.current.showExpandButton).toBe(false)
  })

  it('keeps expand button hidden for single line', () => {
    const { result } = renderHook(() => useInputHeight())

    act(() => {
      result.current.handleContentSizeChange(createContentSizeEvent(LINE_HEIGHT))
    })

    expect(result.current.showExpandButton).toBe(false)
  })

  it('uses correct config values', () => {
    // Verify config values are as expected
    expect(LINE_HEIGHT).toBe(26)
    expect(MAX_VISIBLE_LINES).toBe(4)
    expect(MAX_INPUT_HEIGHT).toBe(96)
  })
})
