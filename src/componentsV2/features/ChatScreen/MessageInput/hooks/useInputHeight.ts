import { useState } from 'react'
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

  const lineCount = rawHeight ? Math.ceil(rawHeight / LINE_HEIGHT) : 0
  const showExpandButton = rawHeight ? lineCount > MAX_VISIBLE_LINES : false

  const inputHeight = rawHeight === undefined ? undefined : Math.min(rawHeight, MAX_INPUT_HEIGHT)

  const handleContentSizeChange = (e: TextInputContentSizeChangeEvent) => {
    const height = e?.nativeEvent?.contentSize?.height
    if (height > 0) {
      setRawHeight(height)
    }
  }

  return {
    inputHeight,
    showExpandButton,
    handleContentSizeChange
  }
}
