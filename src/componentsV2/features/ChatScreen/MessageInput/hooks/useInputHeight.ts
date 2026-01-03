import { useCallback, useMemo, useState } from 'react'
import type { TextInputContentSizeChangeEvent } from 'react-native'

import { TEXT_FIELD_CONFIG } from '../types'

const { LINE_HEIGHT, MAX_VISIBLE_LINES, MAX_INPUT_HEIGHT } = TEXT_FIELD_CONFIG

export interface UseInputHeightReturn {
  inputHeight: number | undefined
  showExpandButton: boolean
  handleContentSizeChange: (e: TextInputContentSizeChangeEvent) => void
}

/**
 * Hook for managing TextField height calculation
 * Replaces the hidden measurement input pattern
 */
export function useInputHeight(): UseInputHeightReturn {
  const [rawHeight, setRawHeight] = useState<number | undefined>(undefined)

  const showExpandButton = useMemo(() => {
    if (!rawHeight) return false
    const lineCount = Math.ceil(rawHeight / LINE_HEIGHT)
    return lineCount > MAX_VISIBLE_LINES
  }, [rawHeight])

  const inputHeight = useMemo(() => {
    if (rawHeight === undefined) return undefined
    return Math.min(rawHeight, MAX_INPUT_HEIGHT)
  }, [rawHeight])

  const handleContentSizeChange = useCallback((e: TextInputContentSizeChangeEvent) => {
    const { height } = e.nativeEvent.contentSize
    setRawHeight(height)
  }, [])

  return {
    inputHeight,
    showExpandButton,
    handleContentSizeChange
  }
}
